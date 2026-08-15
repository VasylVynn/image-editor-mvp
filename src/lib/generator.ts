import { getGenAI, type GenAIDeps } from "./genai-client";
import type { ImageInput } from "./types";

export const GENERATION_MODEL = "gemini-3-pro-image-preview";

export interface GenerateInput {
  mainImage: ImageInput;
  referenceImage?: ImageInput;
  prompt: string;
  aspectRatio: string;
  /** Exact preset dimensions; fal engines with pixel-size inputs use these.
   *  The Gemini engine works from aspectRatio alone and ignores them. */
  targetWidth?: number;
  targetHeight?: number;
  /** Solid-color swatch attached as the last reference image for engines that
   *  misread hex codes in text prompts (see prompt-builder colorMode). */
  backgroundSwatch?: ImageInput;
}

export async function generateImage(
  input: GenerateInput,
  deps: GenAIDeps = { genAI: getGenAI }
): Promise<ImageInput> {
  const ai = deps.genAI();
  const parts = [
    { inlineData: { data: input.mainImage.data, mimeType: input.mainImage.mimeType } },
    ...(input.referenceImage
      ? [{ inlineData: { data: input.referenceImage.data, mimeType: input.referenceImage.mimeType } }]
      : []),
    { text: input.prompt },
  ];

  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
      imageConfig: { aspectRatio: input.aspectRatio, imageSize: "2K" },
    },
  });

  const outParts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = outParts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const modelText = outParts.find((p) => p.text)?.text;
    // User-surfaced via the /api/process error handler — Ukrainian prefix, raw model text appended.
    throw new Error(`Модель не повернула зображення${modelText ? `: ${modelText}` : ""}`);
  }
  return {
    data: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType ?? "image/png",
  };
}
