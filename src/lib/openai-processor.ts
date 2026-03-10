import OpenAI from "openai";
import { toFile } from "openai";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function processImageWithOpenAI(
  inputBuffer: Buffer
): Promise<Buffer> {
  // Convert to PNG (OpenAI requires PNG for edit endpoint)
  const pngBuffer = await sharp(inputBuffer).png().toBuffer();

  const file = await toFile(new Uint8Array(pngBuffer), "product.png", {
    type: "image/png",
  });

  const response = await openai.images.edit({
    model: "gpt-image-1-mini",
    image: file,
    prompt:
      "Replace ONLY the background of this image with a plain, solid, uniform light gray color (#E5E5E5). " +
      "The product in the image must remain COMPLETELY UNCHANGED - preserve every single detail, texture, color, shadow, reflection, stitching, label, and pixel of the product exactly as it appears in the original photo. " +
      "Do NOT alter, enhance, smooth, sharpen, recolor, or modify the product in any way. " +
      "Do NOT remove any part of the product such as tags, laces, straps, handles, or small details. " +
      "Center the product in the frame. " +
      "The final image should look like the exact same product was photographed on a plain gray studio backdrop.",
    size: "1024x1024",
    quality: "high",
  });

  const imageData = response.data?.[0];
  if (!imageData?.b64_json) {
    throw new Error("OpenAI did not return image data");
  }

  return Buffer.from(imageData.b64_json, "base64");
}
