import sharp from "sharp";
import { removeBackground as removeBg } from "@imgly/background-removal-node";

const TARGET_SIZE = 1024;
const PRODUCT_FILL_RATIO = 0.9; // Product fills 90% of canvas

export async function removeBackground(
  inputBuffer: Buffer
): Promise<Buffer> {
  // Convert input to PNG first (library requires known format)
  const pngBuffer = await sharp(inputBuffer).png().toBuffer();
  const blob = new Blob([new Uint8Array(pngBuffer)], { type: "image/png" });
  const resultBlob = await removeBg(blob, {
    output: { format: "image/png" },
  });
  const arrayBuffer = await resultBlob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function centerProduct(
  transparentBuffer: Buffer,
  targetWidth: number = TARGET_SIZE,
  targetHeight: number = TARGET_SIZE
): Promise<Buffer> {
  // Trim transparent edges to get tight crop around product
  const trimmed = sharp(transparentBuffer).trim();
  const trimmedBuffer = await trimmed.toBuffer();
  const trimmedMeta = await sharp(trimmedBuffer).metadata();

  const trimmedW = trimmedMeta.width!;
  const trimmedH = trimmedMeta.height!;

  // Calculate max area for product (80% of target)
  const maxW = Math.floor(targetWidth * PRODUCT_FILL_RATIO);
  const maxH = Math.floor(targetHeight * PRODUCT_FILL_RATIO);

  // Scale to fit within the max area while maintaining aspect ratio
  const scale = Math.min(maxW / trimmedW, maxH / trimmedH);
  const newW = Math.round(trimmedW * scale);
  const newH = Math.round(trimmedH * scale);

  // Resize the trimmed product
  const resized = await sharp(trimmedBuffer)
    .resize(newW, newH, { fit: "inside" })
    .toBuffer();

  // Calculate padding to center on target canvas
  const left = Math.floor((targetWidth - newW) / 2);
  const top = Math.floor((targetHeight - newH) / 2);
  const right = targetWidth - newW - left;
  const bottom = targetHeight - newH - top;

  // Extend with transparent background to center
  return sharp(resized)
    .extend({
      top,
      bottom,
      left,
      right,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();
}

export async function featherEdges(
  transparentBuffer: Buffer,
  blurRadius: number = 4
): Promise<Buffer> {
  // Soften hard cutout edges by blurring the alpha channel
  // Higher blur = softer, more natural edge transition
  const { width, height } = await sharp(transparentBuffer).ensureAlpha().metadata();

  // Extract alpha channel and blur it for soft edges
  const alpha = await sharp(transparentBuffer)
    .extractChannel(3)
    .blur(blurRadius)
    .toBuffer();

  // Extract RGB channels (without alpha)
  const rgb = await sharp(transparentBuffer)
    .removeAlpha()
    .toBuffer();

  // Recombine RGB with the softened alpha
  return sharp(rgb)
    .joinChannel(alpha)
    .resize(width, height)
    .png()
    .toBuffer();
}

export async function compositeOnGray(
  centeredBuffer: Buffer,
  targetWidth: number = TARGET_SIZE,
  targetHeight: number = TARGET_SIZE,
  bgColor = { r: 229, g: 229, b: 229 }
): Promise<Buffer> {
  // Create gray background
  const background = sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background: { ...bgColor, alpha: 1 },
    },
  }).png();

  // Composite product on gray background
  return background
    .composite([{ input: centeredBuffer, gravity: "center" }])
    .png()
    .toBuffer();
}

export async function processImage(inputBuffer: Buffer): Promise<Buffer> {
  const transparent = await removeBackground(inputBuffer);
  const feathered = await featherEdges(transparent);
  const centered = await centerProduct(feathered);
  const result = await compositeOnGray(centered);
  return result;
}
