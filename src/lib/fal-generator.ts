import { fal } from "@fal-ai/client";
import type { ImageInput } from "./types";
import type { GenerateInput } from "./generator";

export interface FalDeps {
  subscribe: typeof fal.subscribe;
  /** Uploads a blob to fal storage and returns its hosted URL. */
  upload?: (blob: Blob) => Promise<string>;
}

export interface FalImageFile {
  url: string;
  content_type?: string;
}

let configured = false;
export function ensureFalConfigured(): void {
  if (!process.env.FAL_KEY) {
    // User-surfaced via route error handlers — Ukrainian.
    throw new Error("FAL_KEY не налаштовано. Додайте його у .env.local");
  }
  if (!configured) {
    fal.config({ credentials: process.env.FAL_KEY });
    configured = true;
  }
}

export function toDataUri(image: ImageInput): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

// fal rejects inline files over 5MB (422 file_too_large, verified live) —
// upscaled intermediates easily exceed that. Anything beyond a modest size is
// uploaded to fal storage first and passed as a hosted URL instead of an
// inline data URI; small images stay inline to skip the extra roundtrip.
const INLINE_IMAGE_LIMIT_BYTES = 900 * 1024;

export async function imageToFalUrl(image: ImageInput, deps: FalDeps): Promise<string> {
  const bytes = Buffer.from(image.data, "base64");
  if (bytes.byteLength <= INLINE_IMAGE_LIMIT_BYTES) return toDataUri(image);
  const upload = deps.upload ?? ((blob: Blob) => fal.storage.upload(blob));
  return upload(new Blob([bytes], { type: image.mimeType }));
}

// Each fal endpoint has its own sizing knobs; map the preset's exact target
// dimensions into whatever the endpoint accepts, preserving the ratio.
function endpointInput(
  endpoint: string,
  input: GenerateInput,
  imageUrls: string[]
): Record<string, unknown> {
  const base = {
    prompt: input.prompt,
    image_urls: imageUrls,
    output_format: "png",
    sync_mode: true,
    num_images: 1,
  };
  const width = input.targetWidth;
  const height = input.targetHeight;

  if (endpoint.includes("seedream")) {
    if (!width || !height) return base;
    if (endpoint.includes("/v5/")) {
      // v5 wants total area within 1024²..2048²; typical catalog sizes fit
      // as-is (exact output!), tiny presets get doubled to reach the floor.
      const scale = width * height < 1024 * 1024 ? 2 : 1;
      return { ...base, image_size: { width: width * scale, height: height * scale } };
    }
    // v4.x wants dimensions ≥1024; doubling the catalog size keeps the ratio.
    return { ...base, image_size: { width: width * 2, height: height * 2 } };
  }
  if (endpoint.includes("gpt-image")) {
    // GPT Image only knows three canonical sizes; pick by orientation.
    // quality "medium" is this engine entry's whole point (4× cheaper than high).
    const size =
      !width || !height ? "auto" : height > width ? "1024x1536" : width > height ? "1536x1024" : "1024x1024";
    return { ...base, image_size: size, quality: "medium" };
  }
  // Nano Banana family: aspect_ratio enum + resolution tier.
  return { ...base, aspect_ratio: input.aspectRatio, resolution: input.imageSize ?? "2K" };
}

export async function falFileToImageInput(file: FalImageFile): Promise<ImageInput> {
  if (file.url.startsWith("data:")) {
    const comma = file.url.indexOf(",");
    const mimeType = file.url.slice(5, file.url.indexOf(";"));
    return { data: file.url.slice(comma + 1), mimeType: mimeType || "image/png" };
  }
  const response = await fetch(file.url);
  if (!response.ok) {
    throw new Error(`Не вдалося завантажити результат fal: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    data: buffer.toString("base64"),
    mimeType: file.content_type ?? response.headers.get("content-type") ?? "image/png",
  };
}

export async function generateWithFal(
  endpoint: string,
  input: GenerateInput,
  deps: FalDeps = { subscribe: fal.subscribe.bind(fal) }
): Promise<ImageInput> {
  ensureFalConfigured();
  // Per-endpoint input image caps (verified in fal docs): main image and the
  // color swatch always survive; optional references get trimmed first (the
  // original product reference before the operator's extra one).
  const maxImages = 10;
  const optional: ImageInput[] = [
    ...(input.referenceImage ? [input.referenceImage] : []),
    ...(input.extraImages ?? []),
  ];
  const reservedSlots = 1 + (input.backgroundSwatch ? 1 : 0);
  while (optional.length > maxImages - reservedSlots) optional.shift();

  const imageUrls = await Promise.all([
    imageToFalUrl(input.mainImage, deps),
    ...optional.map((image) => imageToFalUrl(image, deps)),
    // The color swatch must stay LAST — the prompt refers to "the last attached image".
    ...(input.backgroundSwatch ? [imageToFalUrl(input.backgroundSwatch, deps)] : []),
  ]);
  const result = await deps.subscribe(endpoint, {
    input: endpointInput(endpoint, input, imageUrls),
  });
  const image = (result.data as { images?: FalImageFile[] })?.images?.[0];
  if (!image?.url) {
    // User-surfaced via route error handlers — Ukrainian.
    throw new Error("Модель fal не повернула зображення");
  }
  return falFileToImageInput(image);
}
