import OpenAI from "openai";
import { toFile } from "openai";
import { processImage as localProcess } from "./image-processor";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function processImageWithOpenAI(
  inputBuffer: Buffer
): Promise<Buffer> {
  // Step 1: Use local processing for reliable bg removal + centering
  const localResult = await localProcess(inputBuffer);

  // Step 2: Send the clean result to OpenAI for enhancement
  // (add natural shadows, improve lighting, professional product photo look)
  const file = await toFile(new Uint8Array(localResult), "product.png", {
    type: "image/png",
  });

  const response = await openai.images.edit({
    model: "gpt-image-1-mini",
    image: file,
    prompt:
      "This is a product photo on a gray background. Add a subtle, natural drop shadow beneath the product to make it look professionally photographed. Keep the product EXACTLY as it is - do not change the product's colors, shape, texture, or any details whatsoever. Only add a soft shadow on the gray background beneath the product. The background should remain a clean, plain gray (#E5E5E5).",
    size: "1024x1024",
    quality: "high",
  });

  const imageData = response.data?.[0];
  if (!imageData?.b64_json) {
    throw new Error("OpenAI did not return image data");
  }

  return Buffer.from(imageData.b64_json, "base64");
}
