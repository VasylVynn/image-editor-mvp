import { NextRequest, NextResponse } from "next/server";
import { processImage } from "@/lib/image-processor";
import { processImageWithOpenAI, type OpenAIModel } from "@/lib/openai-processor";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    const mode = (formData.get("mode") as string) || "local";

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Accepted: PNG, JPG, WebP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB" },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let resultBuffer: Buffer;

    if (mode === "openai-mini" || mode === "openai-full") {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { error: "OpenAI API key not configured. Add OPENAI_API_KEY to .env.local" },
          { status: 500 }
        );
      }
      const model: OpenAIModel = mode === "openai-full" ? "gpt-image-1" : "gpt-image-1-mini";
      resultBuffer = await processImageWithOpenAI(buffer, model);
    } else {
      resultBuffer = await processImage(buffer);
    }

    return new NextResponse(new Uint8Array(resultBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="processed.png"',
      },
    });
  } catch (error) {
    console.error("Image processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}
