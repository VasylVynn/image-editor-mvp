import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { centerProduct, featherEdges, compositeOnGray } from "./image-processor";

// fal.ai reads FAL_KEY from environment automatically

interface FalImageOutput {
  image: {
    url: string;
    width: number;
    height: number;
    content_type: string;
  };
}

export async function processImageWithFal(
  inputBuffer: Buffer
): Promise<Buffer> {
  // Convert to PNG
  const pngBuffer = await sharp(inputBuffer).png().toBuffer();

  // Upload the image to fal.ai storage first
  const imageFile = new File(
    [new Uint8Array(pngBuffer)],
    "product.png",
    { type: "image/png" }
  );
  const imageUrl = await fal.storage.upload(imageFile);

  // Run BiRefNet background removal model
  const result = await fal.subscribe("fal-ai/birefnet", {
    input: {
      image_url: imageUrl,
      output_format: "png",
    },
  });

  // fal.subscribe returns { data, requestId } — extract image URL
  const data = (result as { data: FalImageOutput }).data ?? (result as unknown as FalImageOutput);
  const outputUrl = data.image.url;
  if (!outputUrl) {
    throw new Error("Fal.ai did not return an image URL");
  }

  // Download the result image
  const response = await fetch(outputUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Fal.ai result: ${response.status}`);
  }
  const resultArrayBuffer = await response.arrayBuffer();
  const transparentBuffer = Buffer.from(resultArrayBuffer);

  // Apply the same post-processing pipeline as local mode
  const feathered = await featherEdges(transparentBuffer);
  const centered = await centerProduct(feathered);
  const composited = await compositeOnGray(centered);
  return composited;
}
