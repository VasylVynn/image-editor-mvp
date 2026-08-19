import { NextResponse } from "next/server";
import { analyzeImages, formatAnalysis } from "@/lib/analyzer";
import { deterministicCompose, finalizeGenerated } from "@/lib/deterministic";
import { generateImage } from "@/lib/generator";
import { generateWithFal } from "@/lib/fal-generator";
import { getEngine, type Engine } from "@/lib/engines";
import { upscaleImage } from "@/lib/upscaler";
import { getUpscaler } from "@/lib/upscalers";
import { colorSwatchImage } from "@/lib/color-swatch";
import { appendEvent } from "@/lib/events";
import { buildPrompt } from "@/lib/prompt-builder";
import { getPreset, type Preset } from "@/lib/presets";
import { downloadImage } from "@/lib/product-fetcher";
import { withTimeout } from "@/lib/timeout";
import type { AnalysisResult, ImageInput } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const GENERATION_TIMEOUT_MS = 120_000;
const ROUTING_ANALYSIS_TIMEOUT_MS = 30_000;
const UPSCALE_TIMEOUT_MS = 60_000;

async function toImageInput(file: File): Promise<ImageInput> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return { data: buffer.toString("base64"), mimeType: file.type };
}

function validateFile(file: File, label: string): NextResponse | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `${label}: невірний тип файлу. Дозволені: PNG, JPG, WebP` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `${label}: файл завеликий. Максимум 10МБ` },
      { status: 413 }
    );
  }
  return null;
}

type Pipeline = "auto" | "deterministic" | "generative";

function parsePipeline(value: string | null): Pipeline {
  return value === "deterministic" || value === "generative" ? value : "auto";
}

interface GenerationOutput {
  prompt: string;
  result: ImageInput;
  analysis: string | null;
  analysisFailed: boolean;
  /** How the model output was normalized to the exact preset size
   *  (null when finalize was disabled or failed — raw model output). */
  finalize: "resize" | null;
  finalizeFailed: boolean;
}

async function runAnalysisAndGeneration(input: {
  mainImage: ImageInput;
  referenceImage?: ImageInput;
  analyze: boolean;
  preset: Preset;
  note?: string;
  engine: Engine;
  extraImages?: ImageInput[];
  /** Analysis already produced by the routing step — don't re-run it. */
  precomputedAnalysis?: AnalysisResult | null;
  precomputedAnalysisFailed?: boolean;
  /** Post-generation normalization to the exact preset format (default on). */
  finalize: boolean;
}): Promise<GenerationOutput> {
  const mainImage = input.mainImage;
  let analysis: string | null = null;
  let analysisFailed = input.precomputedAnalysisFailed ?? false;
  if (input.precomputedAnalysis) {
    analysis = formatAnalysis(input.precomputedAnalysis);
  } else if (input.analyze && !analysisFailed) {
    try {
      const images = input.referenceImage ? [mainImage, input.referenceImage] : [mainImage];
      analysis = formatAnalysis(await analyzeImages(images));
    } catch (err) {
      console.error("Analysis failed, falling back to base prompt:", err);
      analysisFailed = true;
    }
  }

  // fal engines get the background as an attached color swatch instead of a
  // hex code in text — Seedream misreads hex (painted "#E99999" onto one run).
  // Gemini-family engines are the exception: they follow hex text well and
  // the swatch image only confuses them (engine.colorMode === "hex").
  const isFal = input.engine.provider === "fal";
  const useSwatch = isFal && input.engine.colorMode !== "hex";
  const prompt = buildPrompt({
    preset: input.preset,
    analysis: analysis ?? undefined,
    note: input.note,
    extraReferenceCount: input.extraImages?.length ?? 0,
    colorMode: useSwatch ? "reference" : "hex",
  });
  const generateInput = {
    mainImage,
    referenceImage: input.referenceImage,
    extraImages: input.extraImages,
    prompt,
    aspectRatio: input.preset.aspectRatio,
    targetWidth: input.preset.width,
    targetHeight: input.preset.height,
    backgroundSwatch: useSwatch ? colorSwatchImage(input.preset.background) : undefined,
    imageSize: input.engine.imageSize,
    quality: input.engine.quality,
  };
  let result = isFal
    ? await generateWithFal(input.engine.falEndpoint!, generateInput)
    : await generateImage(generateInput);

  // Geometry belongs to code, not the model: normalize the output to the
  // exact preset dimensions (size only — background is left as generated,
  // recompose shifted product colors). Soft-fails — the raw model output is
  // a usable fallback.
  let finalize: GenerationOutput["finalize"] = null;
  let finalizeFailed = false;
  if (input.finalize) {
    try {
      const finalized = await finalizeGenerated(result, input.preset);
      result = finalized.image;
      finalize = finalized.method;
    } catch (err) {
      console.error("Finalize failed, returning the raw model output:", err);
      finalizeFailed = true;
    }
  }

  return { prompt, result, analysis, analysisFailed, finalize, finalizeFailed };
}

// Maps raw Gemini SDK error text to an operator-facing Ukrainian message.
// Falls through to the original message when nothing matches, so unexpected
// errors are never hidden — only the well-known provider failure classes are
// translated.
function mapGenerationError(rawMessage: string): string {
  const msg = rawMessage.toLowerCase();

  if (/\b401\b/.test(msg) || /\b403\b/.test(msg) || /api[ _]?key/.test(msg)) {
    return "Проблема з API-ключем моделі — перевірте GEMINI_API_KEY / FAL_KEY";
  }
  if (/\b429\b/.test(msg) || /resource_exhausted/.test(msg) || /quota/.test(msg) || /exhausted balance/.test(msg)) {
    return "Вичерпано ліміт або кошти API моделі — поповніть білінг";
  }
  if (
    /\b5\d\d\b/.test(msg) ||
    /fetch failed/.test(msg) ||
    /network/.test(msg) ||
    /econnrefused/.test(msg) ||
    /enotfound/.test(msg) ||
    /unavailable/.test(msg)
  ) {
    return "Сервіс генерації недоступний. Спробуйте ще раз";
  }
  if (/timeout/.test(msg) || /\babort/.test(msg)) {
    return "Перевищено час очікування. Спробуйте ще раз";
  }
  return rawMessage;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    const referenceFile = formData.get("reference") as File | null;
    const imageUrl = (formData.get("imageUrl") as string) || undefined;
    const referenceUrl = (formData.get("referenceUrl") as string) || undefined;
    const note = (formData.get("note") as string) || undefined;
    const presetId = (formData.get("presetId") as string) || "default";
    const analyze = (formData.get("analyze") as string) !== "false";
    const engine = getEngine(formData.get("model") as string | null);
    const upscaleEnabled = (formData.get("upscale") as string) === "true";
    const upscaler = upscaleEnabled
      ? getUpscaler(formData.get("upscaler") as string | null)
      : undefined;
    const pipeline = parsePipeline(formData.get("pipeline") as string | null);
    const finalizeEnabled = (formData.get("finalize") as string) !== "false";
    // Attempt bookkeeping for the events log; both are optional and client-generated.
    const sessionId = ((formData.get("sessionId") as string) || undefined)?.slice(0, 64);
    const attemptRaw = Number(formData.get("attempt"));
    const attempt = Number.isInteger(attemptRaw) && attemptRaw > 0 ? attemptRaw : undefined;
    const loggedNote = note?.trim() ? note.trim().slice(0, 500) : undefined;

    const preset = await getPreset(presetId);

    let mainImage: ImageInput;
    if (file) {
      const fileError = validateFile(file, "Основне фото");
      if (fileError) return fileError;
      mainImage = await toImageInput(file);
    } else if (imageUrl) {
      mainImage = await downloadImage(imageUrl, undefined, request.signal);
    } else {
      return NextResponse.json({ error: "Не надано зображення" }, { status: 400 });
    }

    let referenceImage: ImageInput | undefined;
    if (referenceFile) {
      const refError = validateFile(referenceFile, "Референс");
      if (refError) return refError;
      referenceImage = await toImageInput(referenceFile);
    } else if (referenceUrl) {
      referenceImage = await downloadImage(referenceUrl, undefined, request.signal);
    }

    // Optional extra references added at regenerate time (up to 4).
    const extraFiles = formData
      .getAll("extra")
      .filter((entry): entry is File => entry instanceof File)
      .slice(0, 4);
    const extraImages: ImageInput[] = [];
    for (const extraFile of extraFiles) {
      const extraError = validateFile(extraFile, "Додаткове фото");
      if (extraError) return extraError;
      extraImages.push(await toImageInput(extraFile));
    }
    // Extra references picked from the URL-mode gallery; shares the cap of 4.
    const extraUrls = formData
      .getAll("extraUrl")
      .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
      .slice(0, Math.max(0, 4 - extraImages.length));
    extraImages.push(
      ...(await Promise.all(
        extraUrls.map((extraUrl) => downloadImage(extraUrl, undefined, request.signal))
      ))
    );

    const mode: "file" | "url" = file ? "file" : "url";
    const startedAt = Date.now();

    // Optional pre-step, shared by BOTH paths: upscale the (often tiny)
    // source photo so the compose/analyzer/generator work from more pixels.
    // Soft-fails — the original image is a perfectly usable fallback.
    let upscaleFailed = false;
    if (upscaler) {
      try {
        mainImage = await withTimeout(
          upscaleImage(upscaler.falEndpoint, mainImage),
          UPSCALE_TIMEOUT_MS,
          `Upscale timeout after ${UPSCALE_TIMEOUT_MS}ms`
        );
      } catch (err) {
        console.error("Upscale failed, using the original image:", err);
        upscaleFailed = true;
      }
    }

    // ---------------------------------------------------------------------
    // Routing. The deterministic path (local sharp compose, product pixels
    // untouched, $0) runs when:
    //   - forced by the operator (pipeline=deterministic), or
    //   - pipeline=auto AND nothing implies a semantic edit: no operator
    //     note, no reference/extra images, analysis is on and reports no
    //     unwanted objects, and the compose gates (uniform background) pass.
    // Everything else goes to the generative path.
    // ---------------------------------------------------------------------
    let precomputedAnalysis: AnalysisResult | null = null;
    let precomputedAnalysisFailed = false;
    let deterministicReason: string | null = null;

    const wantsSemanticEdit =
      !!note?.trim() || !!referenceImage || extraImages.length > 0;

    if (pipeline === "deterministic" && note?.trim()) {
      return NextResponse.json(
        {
          error:
            "Режим «Лише фон — без AI» не виконує текстові інструкції. Приберіть примітку або оберіть режим AI.",
        },
        { status: 422 }
      );
    }

    if (pipeline === "deterministic" || (pipeline === "auto" && !wantsSemanticEdit && analyze)) {
      let unwantedObjects: string[] | null = pipeline === "deterministic" ? [] : null;
      if (pipeline === "auto") {
        try {
          precomputedAnalysis = await withTimeout(
            analyzeImages(referenceImage ? [mainImage, referenceImage] : [mainImage]),
            ROUTING_ANALYSIS_TIMEOUT_MS,
            `Analysis timeout after ${ROUTING_ANALYSIS_TIMEOUT_MS}ms`
          );
          unwantedObjects = precomputedAnalysis.unwantedObjects ?? [];
        } catch (err) {
          console.error("Analysis failed, falling back to base prompt:", err);
          precomputedAnalysisFailed = true;
        }
      }

      if (unwantedObjects && unwantedObjects.length === 0) {
        try {
          const composed = await deterministicCompose(mainImage, preset);
          if (composed.ok) {
            await appendEvent({
              type: "generation",
              engineId: "deterministic",
              presetId: preset.id,
              mode,
              durationMs: Date.now() - startedAt,
              ok: true,
              upscaled: !!upscaler,
              pipeline: "deterministic",
              note: loggedNote,
              sessionId,
              attempt,
            });
            return NextResponse.json({
              image: `data:${composed.image.mimeType};base64,${composed.image.data}`,
              promptUsed: "",
              analysis: precomputedAnalysis ? formatAnalysis(precomputedAnalysis) : null,
              analysisFailed: precomputedAnalysisFailed,
              upscaleFailed,
              model: "deterministic",
              pipeline: "deterministic",
              finalize: null,
              finalizeFailed: false,
            });
          }
          deterministicReason = composed.reason;
        } catch (err) {
          console.error("Deterministic compose failed, falling back to generation:", err);
          deterministicReason = "внутрішня помилка обробки";
        }
      } else if (unwantedObjects && unwantedObjects.length > 0) {
        deterministicReason = `на фото є зайві об'єкти: ${unwantedObjects.join(", ")}`;
      }

      // Forced deterministic must not silently burn money on a model call —
      // tell the operator why it can't work and let them switch modes.
      if (pipeline === "deterministic") {
        await appendEvent({
          type: "generation",
          engineId: "deterministic",
          presetId: preset.id,
          mode,
          durationMs: Date.now() - startedAt,
          ok: false,
          errorClass: deterministicReason ?? "невідома причина",
          upscaled: !!upscaler,
          pipeline: "deterministic",
          note: loggedNote,
          sessionId,
          attempt,
        });
        return NextResponse.json(
          { error: `Детермінована обробка неможлива: ${deterministicReason}. Оберіть режим AI.` },
          { status: 422 }
        );
      }
    }

    let generation: GenerationOutput;
    try {
      generation = await withTimeout(
        runAnalysisAndGeneration({
          mainImage,
          referenceImage,
          analyze,
          preset,
          note,
          engine,
          extraImages,
          precomputedAnalysis,
          precomputedAnalysisFailed,
          finalize: finalizeEnabled,
        }),
        GENERATION_TIMEOUT_MS,
        `Generation timeout after ${GENERATION_TIMEOUT_MS}ms`
      );
    } catch (err) {
      console.error("Generation error:", err);
      const rawMessage = err instanceof Error ? err.message : "Помилка генерації";
      const message = mapGenerationError(rawMessage);
      await appendEvent({
        type: "generation",
        engineId: engine.id,
        presetId: preset.id,
        mode,
        durationMs: Date.now() - startedAt,
        ok: false,
        errorClass: message,
        upscaled: !!upscaler,
        pipeline: "generative",
        note: loggedNote,
        sessionId,
        attempt,
      });
      return NextResponse.json(
        { error: message, details: message !== rawMessage ? rawMessage : undefined },
        { status: 500 }
      );
    }

    await appendEvent({
      type: "generation",
      engineId: engine.id,
      presetId: preset.id,
      mode,
      durationMs: Date.now() - startedAt,
      ok: true,
      upscaled: !!upscaler,
      pipeline: "generative",
      note: loggedNote,
      sessionId,
      attempt,
    });

    return NextResponse.json({
      image: `data:${generation.result.mimeType};base64,${generation.result.data}`,
      promptUsed: generation.prompt,
      analysis: generation.analysis,
      analysisFailed: generation.analysisFailed,
      upscaleFailed,
      model: engine.id,
      pipeline: "generative",
      finalize: generation.finalize,
      finalizeFailed: generation.finalizeFailed,
      deterministicReason,
    });
  } catch (error) {
    console.error("Processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Помилка обробки" },
      { status: 500 }
    );
  }
}
