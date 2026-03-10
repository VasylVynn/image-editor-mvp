import OpenAI from "openai";
import { toFile } from "openai";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type OpenAIModel = "gpt-image-1-mini" | "gpt-image-1" | "gpt-image-1.5";

const PROMPT =
  "You are a background removal tool. Your ONLY job is to erase the background and fill it with flat solid gray color #E5E5E5. " +
  "ABSOLUTE RULES - violating any of these is a failure:\n" +
  "1. The product pixels must be IDENTICAL to the input - copy them exactly, do not regenerate or redraw them.\n" +
  "2. Every printed image, graphic, logo, text, pattern, and artwork ON the product must be preserved EXACTLY as-is, pixel for pixel.\n" +
  "3. The product position, angle, scale, and arrangement of all items must remain EXACTLY the same as the input.\n" +
  "4. Do NOT change colors, textures, folds, wrinkles, shadows on the product, or any visual detail.\n" +
  "5. Do NOT rearrange, separate, lift, or reposition any items - keep the exact same flat-lay or arrangement.\n" +
  "6. ONLY replace background pixels with solid gray. Nothing else changes.";

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
