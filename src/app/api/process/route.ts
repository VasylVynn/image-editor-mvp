import { NextResponse } from "next/server";
import { analyzeImages, formatAnalysis } from "@/lib/analyzer";
import { generateImage } from "@/lib/generator";
import { generateWithFal } from "@/lib/fal-generator";
import { getEngine, type Engine } from "@/lib/engines";
import { upscaleImage } from "@/lib/upscaler";
import { getUpscaler, type Upscaler } from "@/lib/upscalers";
import { colorSwatchImage } from "@/lib/color-swatch";
import { buildPrompt } from "@/lib/prompt-builder";
import { getPreset, type Preset } from "@/lib/presets";
import { downloadImage } from "@/lib/product-fetcher";
import type { ImageInput } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const GENERATION_TIMEOUT_MS = 120_000;

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

// Races a promise against a timeout so a hanging Gemini call can't keep the
// request open forever. The underlying promise isn't cancelled (the SDK call
// takes no signal) — its result is just discarded once the timeout wins.
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      AbortSignal.timeout(ms).addEventListener("abort", () => reject(new Error(timeoutMessage)), {
        once: true,
      });
    }),
  ]);
}

interface GenerationOutput {
  prompt: string;
  result: ImageInput;
  analysis: string | null;
  analysisFailed: boolean;
  upscaleFailed: boolean;
}

async function runAnalysisAndGeneration(input: {
  mainImage: ImageInput;
  referenceImage?: ImageInput;
  analyze: boolean;
  preset: Preset;
  note?: string;
  engine: Engine;
  upscaler?: Upscaler;
  extraImages?: ImageInput[];
}): Promise<GenerationOutput> {
  // Optional pre-step: upscale the (often tiny) source photo so the generator
  // and analyzer work from more pixels. Soft-fails like analysis — the
  // original image is a perfectly usable fallback.
  let mainImage = input.mainImage;
  let upscaleFailed = false;
  if (input.upscaler) {
    try {
      mainImage = await upscaleImage(input.upscaler.falEndpoint, mainImage);
    } catch (err) {
      console.error("Upscale failed, using the original image:", err);
      upscaleFailed = true;
    }
  }

  let analysis: string | null = null;
  let analysisFailed = false;
  if (input.analyze) {
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
  const result = isFal
    ? await generateWithFal(input.engine.falEndpoint!, generateInput)
    : await generateImage(generateInput);

  return { prompt, result, analysis, analysisFailed, upscaleFailed };
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

    let generation: GenerationOutput;
    try {
      generation = await withTimeout(
        runAnalysisAndGeneration({ mainImage, referenceImage, analyze, preset, note, engine, upscaler, extraImages }),
        GENERATION_TIMEOUT_MS,
        `Generation timeout after ${GENERATION_TIMEOUT_MS}ms`
      );
    } catch (err) {
      console.error("Generation error:", err);
      const rawMessage = err instanceof Error ? err.message : "Помилка генерації";
      const message = mapGenerationError(rawMessage);
      return NextResponse.json(
        { error: message, details: message !== rawMessage ? rawMessage : undefined },
        { status: 500 }
      );
    }

    return NextResponse.json({
      image: `data:${generation.result.mimeType};base64,${generation.result.data}`,
      promptUsed: generation.prompt,
      analysis: generation.analysis,
      analysisFailed: generation.analysisFailed,
      upscaleFailed: generation.upscaleFailed,
      model: engine.id,
    });
  } catch (error) {
    console.error("Processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Помилка обробки" },
      { status: 500 }
    );
  }
}
