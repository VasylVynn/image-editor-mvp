import { NextResponse } from "next/server";
import { analyzeImages, formatAnalysis } from "@/lib/analyzer";
import { generateImage } from "@/lib/generator";
import { buildPrompt } from "@/lib/prompt-builder";
import { getPreset } from "@/lib/presets";
import { downloadImage } from "@/lib/product-fetcher";
import type { ImageInput } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

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

    const preset = getPreset(presetId);

    let mainImage: ImageInput;
    if (file) {
      const fileError = validateFile(file, "Основне фото");
      if (fileError) return fileError;
      mainImage = await toImageInput(file);
    } else if (imageUrl) {
      mainImage = await downloadImage(imageUrl);
    } else {
      return NextResponse.json({ error: "Не надано зображення" }, { status: 400 });
    }

    let referenceImage: ImageInput | undefined;
    if (referenceFile) {
      const refError = validateFile(referenceFile, "Референс");
      if (refError) return refError;
      referenceImage = await toImageInput(referenceFile);
    } else if (referenceUrl) {
      referenceImage = await downloadImage(referenceUrl);
    }

    let analysis: string | null = null;
    let analysisFailed = false;
    if (analyze) {
      try {
        const images = referenceImage ? [mainImage, referenceImage] : [mainImage];
        analysis = formatAnalysis(await analyzeImages(images));
      } catch (err) {
        console.error("Analysis failed, falling back to base prompt:", err);
        analysisFailed = true;
      }
    }

    const prompt = buildPrompt({ preset, analysis: analysis ?? undefined, note });
    const result = await generateImage({
      mainImage,
      referenceImage,
      prompt,
      aspectRatio: preset.aspectRatio,
    });

    return NextResponse.json({
      image: `data:${result.mimeType};base64,${result.data}`,
      promptUsed: prompt,
      analysis,
      analysisFailed,
    });
  } catch (error) {
    console.error("Processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Помилка обробки" },
      { status: 500 }
    );
  }
}
