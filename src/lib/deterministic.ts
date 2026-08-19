import sharp from "sharp";
import type { ImageInput } from "./types";
import type { Preset } from "./preset-schema";

// Level A of the pipeline: photos that only need background / size / centering
// work are composed locally with sharp — the model is never called and the
// product pixels are carried over bit-for-bit (see the alpha blend below:
// alpha 255 reproduces the source pixel exactly). Generated images get a much
// lighter finalize step: size-only normalization (contain-resize to the exact
// preset dimensions) — background recompose shifted product colors on model
// outputs, so it is reserved for the deterministic path.
//
// Tunables are calibrated on the synthetic fixtures in deterministic.test.ts.

/** Border-ring thickness used for background estimation, as a fraction of min(w, h). */
const BORDER_RING_FRACTION = 0.02;
/** Chebyshev RGB distance under which a ring pixel counts as "background". */
const RING_TOLERANCE = 14;
/** Distance ≤ low → fully background (alpha 0); ≥ high → fully product (alpha 255). */
const ALPHA_LOW = 10;
const ALPHA_HIGH = 30;
/** Alpha above which a pixel anchors the product box (scale + centering). */
const STRONG_ALPHA = 230;
/** Alpha above which a pixel is carried into the output (keeps soft shadows). */
const SOFT_ALPHA = 8;
/** Product must cover between these fractions of the frame, else the
 *  background estimate is unreliable (empty photo / product fills the frame). */
const MIN_COVERAGE = 0.005;
const MAX_COVERAGE = 0.92;
/** Never enlarge the product more than this — lanczos upscaling beyond ~2×
 *  visibly softens fabric texture. */
const MAX_UPSCALE = 2;
/** Product box target size inside the canvas (fraction of width / height). */
const SAFE_WIDTH = 0.8;
const SAFE_HEIGHT = 0.84;

/** How strictly the deterministic entry point gates on background uniformity. */
const STRICT_GATE = { uniformityMin: 0.97 };

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number; // inclusive
  y1: number; // inclusive
}

export interface ComposeStats {
  /** Fraction of border-ring pixels matching the estimated background color. */
  bgUniformity: number;
  bgColor: Rgb;
  /** Fraction of the frame covered by strong product pixels. */
  coverage: number;
  /** Applied product scale factor. */
  scale: number;
}

export type DeterministicOutcome =
  | { ok: true; image: ImageInput; stats: ComposeStats }
  | { ok: false; reason: string };

export interface FinalizeOutcome {
  image: ImageInput;
  /** Always "resize": plain contain-resize onto the preset background — exact
   *  dimensions, model background and product colors untouched. ("recompose"
   *  was retired: replacing the background alpha-blended edge pixels and
   *  visibly shifted product colors on generated images.) */
  method: "resize";
  bgUniformity: number;
}

function hexToRgb(hex: string): Rgb {
  const value = parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

async function decode(input: ImageInput): Promise<RawImage> {
  // .rotate() applies the EXIF orientation (phone photos); flatten folds any
  // source transparency onto white so "transparent" reads as background.
  const { data, info } = await sharp(Buffer.from(input.data, "base64"))
    .rotate()
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Median background color + uniformity, sampled from a border ring. */
function estimateBackground(image: RawImage): { color: Rgb; uniformity: number } {
  const { data, width, height } = image;
  const ring = Math.max(2, Math.round(Math.min(width, height) * BORDER_RING_FRACTION));
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  const samples: number[] = [];

  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    histR[data[i]]++;
    histG[data[i + 1]]++;
    histB[data[i + 2]]++;
    samples.push(i);
  };
  for (let y = 0; y < height; y++) {
    const isEdgeRow = y < ring || y >= height - ring;
    if (isEdgeRow) {
      for (let x = 0; x < width; x++) push(x, y);
    } else {
      for (let x = 0; x < ring; x++) push(x, y);
      for (let x = width - ring; x < width; x++) push(x, y);
    }
  }

  const median = (hist: Uint32Array): number => {
    const half = samples.length / 2;
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen >= half) return v;
    }
    return 255;
  };
  const color = { r: median(histR), g: median(histG), b: median(histB) };

  let inliers = 0;
  for (const i of samples) {
    const d = Math.max(
      Math.abs(data[i] - color.r),
      Math.abs(data[i + 1] - color.g),
      Math.abs(data[i + 2] - color.b)
    );
    if (d <= RING_TOLERANCE) inliers++;
  }
  return { color, uniformity: samples.length ? inliers / samples.length : 0 };
}

/** Distance-to-background ramp: 0 = background, 255 = product. */
function buildAlpha(image: RawImage, bg: Rgb, low: number): Uint8Array {
  const { data, width, height } = image;
  const alpha = new Uint8Array(width * height);
  const high = Math.max(ALPHA_HIGH, low + 8);
  const range = high - low;
  for (let p = 0, i = 0; p < alpha.length; p++, i += 4) {
    const d = Math.max(
      Math.abs(data[i] - bg.r),
      Math.abs(data[i + 1] - bg.g),
      Math.abs(data[i + 2] - bg.b)
    );
    alpha[p] = d <= low ? 0 : d >= high ? 255 : Math.round(((d - low) / range) * 255);
  }
  return alpha;
}

/**
 * Alpha with a noise-floor guard: heavy JPEG noise can lift most background
 * pixels above SOFT_ALPHA, ballooning the soft box to the whole frame (which
 * would tint the entire canvas with the source background). When that
 * happens, rebuild once with a raised floor.
 */
function buildAlphaAdaptive(
  image: RawImage,
  bg: Rgb
): { alpha: Uint8Array; softBoxCoversFrame: boolean } {
  const frame = image.width * image.height;
  let alpha = buildAlpha(image, bg, ALPHA_LOW);
  let soft = boundingBox(alpha, image.width, image.height, SOFT_ALPHA);
  const covers = (box: Box | null) =>
    !!box && ((box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1)) / frame > 0.98;
  if (covers(soft)) {
    alpha = buildAlpha(image, bg, ALPHA_LOW + 6);
    soft = boundingBox(alpha, image.width, image.height, SOFT_ALPHA);
  }
  return { alpha, softBoxCoversFrame: covers(soft) };
}

function boundingBox(
  alpha: Uint8Array,
  width: number,
  height: number,
  threshold: number
): Box | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] >= threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Crop the soft box out of the source, resize it, and alpha-blend it onto a
 * canvas of the preset's exact size and background color, positioning the
 * STRONG (product) box center at the canvas center. Fully opaque pixels
 * reproduce the source values exactly.
 */
async function recompose(
  image: RawImage,
  alpha: Uint8Array,
  softBox: Box,
  strongBox: Box,
  preset: Preset
): Promise<{ image: ImageInput; scale: number }> {
  const bg = hexToRgb(preset.background);
  const cropW = softBox.x1 - softBox.x0 + 1;
  const cropH = softBox.y1 - softBox.y0 + 1;

  // RGBA crop with the computed alpha in the A channel, so a single sharp
  // resize scales color and mask together.
  const crop = Buffer.allocUnsafe(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const srcRow = (y + softBox.y0) * image.width;
    for (let x = 0; x < cropW; x++) {
      const srcP = srcRow + softBox.x0 + x;
      const srcI = srcP * 4;
      const dstI = (y * cropW + x) * 4;
      crop[dstI] = image.data[srcI];
      crop[dstI + 1] = image.data[srcI + 1];
      crop[dstI + 2] = image.data[srcI + 2];
      crop[dstI + 3] = alpha[srcP];
    }
  }

  const strongW = strongBox.x1 - strongBox.x0 + 1;
  const strongH = strongBox.y1 - strongBox.y0 + 1;
  const scale = Math.min(
    (preset.width * SAFE_WIDTH) / strongW,
    (preset.height * SAFE_HEIGHT) / strongH,
    MAX_UPSCALE
  );
  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(cropH * scale));

  const resized =
    outW === cropW && outH === cropH
      ? crop
      : await sharp(crop, { raw: { width: cropW, height: cropH, channels: 4 } })
          .resize(outW, outH, { kernel: "lanczos3", fit: "fill" })
          .raw()
          .toBuffer();

  // Place the scaled STRONG-box center at the canvas center.
  const strongCx = (strongBox.x0 + strongBox.x1 + 1) / 2 - softBox.x0;
  const strongCy = (strongBox.y0 + strongBox.y1 + 1) / 2 - softBox.y0;
  const offsetX = Math.round(preset.width / 2 - strongCx * scale);
  const offsetY = Math.round(preset.height / 2 - strongCy * scale);

  // Canvas filled with the exact background hex, then a clipped alpha blend.
  const canvas = Buffer.allocUnsafe(preset.width * preset.height * 4);
  for (let i = 0; i < canvas.length; i += 4) {
    canvas[i] = bg.r;
    canvas[i + 1] = bg.g;
    canvas[i + 2] = bg.b;
    canvas[i + 3] = 255;
  }
  const yStart = Math.max(0, -offsetY);
  const yEnd = Math.min(outH, preset.height - offsetY);
  const xStart = Math.max(0, -offsetX);
  const xEnd = Math.min(outW, preset.width - offsetX);
  for (let y = yStart; y < yEnd; y++) {
    const srcRow = y * outW;
    const dstRow = (y + offsetY) * preset.width;
    for (let x = xStart; x < xEnd; x++) {
      const srcI = (srcRow + x) * 4;
      const a = resized[srcI + 3];
      if (a === 0) continue;
      const dstI = (dstRow + x + offsetX) * 4;
      if (a === 255) {
        canvas[dstI] = resized[srcI];
        canvas[dstI + 1] = resized[srcI + 1];
        canvas[dstI + 2] = resized[srcI + 2];
      } else {
        canvas[dstI] = Math.round(bg.r + ((resized[srcI] - bg.r) * a) / 255);
        canvas[dstI + 1] = Math.round(bg.g + ((resized[srcI + 1] - bg.g) * a) / 255);
        canvas[dstI + 2] = Math.round(bg.b + ((resized[srcI + 2] - bg.b) * a) / 255);
      }
    }
  }

  const png = await sharp(canvas, {
    raw: { width: preset.width, height: preset.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return { image: { data: png.toString("base64"), mimeType: "image/png" }, scale };
}

/**
 * Level A: compose the catalog shot locally, without any generation.
 * Refuses (ok: false, Ukrainian operator-facing reason) whenever the photo
 * doesn't meet the strict "plain uniform background" bar — the caller then
 * falls back to the generative path.
 */
export async function deterministicCompose(
  input: ImageInput,
  preset: Preset
): Promise<DeterministicOutcome> {
  const image = await decode(input);
  const { color, uniformity } = estimateBackground(image);
  if (uniformity < STRICT_GATE.uniformityMin) {
    return {
      ok: false,
      reason: `фон не однотонний (рівномірність ${Math.round(uniformity * 100)}%)`,
    };
  }

  const { alpha } = buildAlphaAdaptive(image, color);
  const strongBox = boundingBox(alpha, image.width, image.height, STRONG_ALPHA);
  if (!strongBox) return { ok: false, reason: "не вдалося виділити товар на фоні" };

  const coverage =
    ((strongBox.x1 - strongBox.x0 + 1) * (strongBox.y1 - strongBox.y0 + 1)) /
    (image.width * image.height);
  if (coverage < MIN_COVERAGE) {
    return { ok: false, reason: "товар займає замалу частину кадру" };
  }
  if (coverage > MAX_COVERAGE) {
    return { ok: false, reason: "товар займає майже весь кадр — не видно однотонного фону" };
  }

  const softBox = boundingBox(alpha, image.width, image.height, SOFT_ALPHA) ?? strongBox;
  const { image: composed, scale } = await recompose(image, alpha, softBox, strongBox, preset);
  return {
    ok: true,
    image: composed,
    stats: { bgUniformity: uniformity, bgColor: color, coverage, scale },
  };
}

/**
 * Post-generation normalization, size only: models return "almost" the
 * requested dimensions; this contain-resizes to the exact preset size.
 * The model's background and product colors are left untouched — background
 * recompose visibly shifted product colors on generated images.
 */
export async function finalizeGenerated(
  input: ImageInput,
  preset: Preset
): Promise<FinalizeOutcome> {
  const image = await decode(input);
  const { uniformity } = estimateBackground(image);

  const resized = await sharp(Buffer.from(input.data, "base64"))
    .rotate()
    .flatten({ background: preset.background })
    .resize(preset.width, preset.height, { fit: "contain", background: preset.background })
    .png()
    .toBuffer();
  return {
    image: { data: resized.toString("base64"), mimeType: "image/png" },
    method: "resize",
    bgUniformity: uniformity,
  };
}
