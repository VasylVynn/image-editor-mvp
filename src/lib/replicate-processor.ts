import Replicate from "replicate";
import sharp from "sharp";
import { centerProduct, featherEdges, compositeOnGray } from "./image-processor";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function processImageWithReplicate(
  inputBuffer: Buffer
): Promise<Buffer> {
  // Convert to PNG for consistency
  const pngBuffer = await sharp(inputBuffer).png().toBuffer();

  // Upload image as a Blob — Replicate SDK auto-uploads file inputs
  const output = await replicate.run("bria/remove-background", {
    input: {
      image: new Blob([new Uint8Array(pngBuffer)], { type: "image/png" }),
    },
  });

  // Output is a FileOutput object with .url() method
  const fileOutput = output as { url: () => string };
  if (!fileOutput || typeof fileOutput.url !== "function") {
    throw new Error("Unexpected Replicate output format");
  }

  // Download the transparent PNG result
  const response = await fetch(fileOutput.url());
  if (!response.ok) {
    throw new Error(`Failed to download Replicate result: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const transparentBuffer = Buffer.from(arrayBuffer);

  // Apply the same post-processing pipeline as local mode
  const feathered = await featherEdges(transparentBuffer);
  const centered = await centerProduct(feathered);
  const result = await compositeOnGray(centered);
  return result;
}
