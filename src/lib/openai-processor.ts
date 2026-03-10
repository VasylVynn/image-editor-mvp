import OpenAI from "openai";
import { toFile } from "openai";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type OpenAIModel = "gpt-image-1-mini" | "gpt-image-1";

const PROMPT =
  "This is a product photo. Remove the background and replace it with a plain solid uniform light gray (#E5E5E5). " +
  "CRITICAL: Do NOT redraw, recreate, or regenerate the product. The product must be a pixel-perfect copy of the original. " +
  "Do NOT change any colors, textures, patterns, prints, graphics, text, stitching, folds, wrinkles, shadows, or any visual detail on the product. " +
  "Do NOT reposition, rotate, resize, or rearrange any part of the product or its elements relative to each other. " +
  "Do NOT smooth, sharpen, enhance, or clean up the product in any way. " +
  "Keep the exact same angle, perspective, and layout of the product. " +
  "Only the background changes. Everything else stays identical.";

export async function processImageWithOpenAI(
  inputBuffer: Buffer,
  model: OpenAIModel = "gpt-image-1-mini"
): Promise<Buffer> {
  // Convert to PNG (OpenAI requires PNG for edit endpoint)
  const pngBuffer = await sharp(inputBuffer).png().toBuffer();

  const file = await toFile(new Uint8Array(pngBuffer), "product.png", {
    type: "image/png",
  });

  const response = await openai.images.edit({
    model,
    image: file,
    prompt: PROMPT,
    size: "1024x1024",
    quality: "high",
  });

  const imageData = response.data?.[0];
  if (!imageData?.b64_json) {
    throw new Error("OpenAI did not return image data");
  }

  return Buffer.from(imageData.b64_json, "base64");
}
