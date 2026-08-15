import { fal } from "@fal-ai/client";
import type { ImageInput } from "./types";
import type { GenerateInput } from "./generator";

export interface FalDeps {
  subscribe: typeof fal.subscribe;
}

interface FalImageFile {
  url: string;
  content_type?: string;
}

let configured = false;
function ensureConfigured(): void {
  if (!process.env.FAL_KEY) {
    // User-surfaced via route error handlers — Ukrainian.
    throw new Error("FAL_KEY не налаштовано. Додайте його у .env.local");
  }
  if (!configured) {
    fal.config({ credentials: process.env.FAL_KEY });
    configured = true;
  }
}

function toDataUri(image: ImageInput): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

// Each fal endpoint has its own sizing knobs; map the preset's exact target
// dimensions into whatever the endpoint accepts, preserving the ratio.
function endpointInput(
  endpoint: string,
  input: GenerateInput
): Record<string, unknown> {
  const imageUrls = [
    toDataUri(input.mainImage),
    ...(input.referenceImage ? [toDataUri(input.referenceImage)] : []),
  ];
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
    // Seedream wants dimensions ≥1024; double the catalog size keeps the ratio.
    return width && height
      ? { ...base, image_size: { width: width * 2, height: height * 2 } }
      : base;
  }
  if (endpoint.includes("flux-2")) {
    // FLUX.2 accepts 512–2048 px per side; catalog sizes fit directly.
    return width && height ? { ...base, image_size: { width, height } } : base;
  }
  // Nano Banana family: aspect_ratio enum + resolution.
  return { ...base, aspect_ratio: input.aspectRatio, resolution: "2K" };
}

async function toImageInput(file: FalImageFile): Promise<ImageInput> {
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
  ensureConfigured();
  const result = await deps.subscribe(endpoint, {
    input: endpointInput(endpoint, input),
  });
  const image = (result.data as { images?: FalImageFile[] })?.images?.[0];
  if (!image?.url) {
    // User-surfaced via route error handlers — Ukrainian.
    throw new Error("Модель fal не повернула зображення");
  }
  return toImageInput(image);
}
