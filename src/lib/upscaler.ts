import { fal } from "@fal-ai/client";
import type { ImageInput } from "./types";
import {
  ensureFalConfigured,
  toDataUri,
  falFileToImageInput,
  type FalImageFile,
  type FalDeps,
} from "./fal-generator";

// Upscales an image through a fal upscaler endpoint (registry: upscalers.ts).
// Both supported endpoints take { image_url } and return { image: File }.
export async function upscaleImage(
  endpoint: string,
  image: ImageInput,
  deps: FalDeps = { subscribe: fal.subscribe.bind(fal) }
): Promise<ImageInput> {
  ensureFalConfigured();
  const input: Record<string, unknown> = { image_url: toDataUri(image) };
  if (endpoint.includes("topaz")) {
    // Photo-faithful default model; PNG keeps prints/edges lossless.
    input.model = "Standard V2";
    input.output_format = "png";
  }
  const result = await deps.subscribe(endpoint, { input });
  const file = (result.data as { image?: FalImageFile })?.image;
  if (!file?.url) {
    // User-surfaced via route error handlers — Ukrainian.
    throw new Error("Апскейлер не повернув зображення");
  }
  return falFileToImageInput(file);
}
