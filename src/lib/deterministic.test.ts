import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { deterministicCompose, finalizeGenerated } from "./deterministic";
import type { Preset } from "./preset-schema";
import type { ImageInput } from "./types";

const PRESET: Preset = {
  id: "test",
  name: "Test",
  width: 470,
  height: 650,
  background: "#E9E9E9",
  aspectRatio: "3:4",
  outputDir: "/tmp",
  prompt: "n/a",
};

/** Solid background + centered (or offset) solid rectangle = the "clean
 *  supplier photo" fixture. Returns a base64 PNG ImageInput. */
async function fixture(options: {
  width: number;
  height: number;
  bg: { r: number; g: number; b: number };
  rect: { left: number; top: number; width: number; height: number; color: { r: number; g: number; b: number } };
  noise?: number;
}): Promise<ImageInput> {
  const { width, height, bg, rect, noise = 0 } = options;
  const raw = Buffer.alloc(width * height * 3);
  let seed = 42;
  const rand = () => {
    // Deterministic LCG so failures reproduce.
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inRect =
        x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height;
      const c = inRect ? rect.color : bg;
      const i = (y * width + x) * 3;
      const jitter = noise ? Math.round((rand() - 0.5) * 2 * noise) : 0;
      raw[i] = Math.min(255, Math.max(0, c.r + jitter));
      raw[i + 1] = Math.min(255, Math.max(0, c.g + jitter));
      raw[i + 2] = Math.min(255, Math.max(0, c.b + jitter));
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { data: png.toString("base64"), mimeType: "image/png" };
}

async function decodeResult(image: ImageInput) {
  const { data, info } = await sharp(Buffer.from(image.data, "base64"))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  return { data, width: info.width, height: info.height, channels: info.channels, px };
}

/** Bounding box of pixels matching a color exactly. */
function findBox(
  decoded: Awaited<ReturnType<typeof decodeResult>>,
  color: { r: number; g: number; b: number },
  tolerance = 0
) {
  let x0 = decoded.width, y0 = decoded.height, x1 = -1, y1 = -1;
  for (let y = 0; y < decoded.height; y++) {
    for (let x = 0; x < decoded.width; x++) {
      const p = decoded.px(x, y);
      if (
        Math.abs(p.r - color.r) <= tolerance &&
        Math.abs(p.g - color.g) <= tolerance &&
        Math.abs(p.b - color.b) <= tolerance
      ) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

const RED = { r: 200, g: 30, b: 40 };
const WHITE = { r: 255, g: 255, b: 255 };

describe("deterministicCompose", () => {
  it("composes an off-center product onto the exact canvas, centered, pixels preserved", async () => {
    const input = await fixture({
      width: 800,
      height: 1000,
      bg: WHITE,
      rect: { left: 60, top: 90, width: 300, height: 500, color: RED },
      noise: 3,
    });
    const outcome = await deterministicCompose(input, PRESET);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const out = await decodeResult(outcome.image);
    // Exact canvas.
    expect(out.width).toBe(PRESET.width);
    expect(out.height).toBe(PRESET.height);
    // Exact background hex in all four corners.
    for (const [x, y] of [[0, 0], [out.width - 1, 0], [0, out.height - 1], [out.width - 1, out.height - 1]]) {
      expect(out.px(x, y)).toEqual({ r: 0xe9, g: 0xe9, b: 0xe9 });
    }
    // Product present, centered within a couple of pixels.
    const box = findBox(out, RED, 12);
    expect(box).toBeTruthy();
    const cx = (box!.x0 + box!.x1) / 2;
    const cy = (box!.y0 + box!.y1) / 2;
    expect(Math.abs(cx - PRESET.width / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(cy - PRESET.height / 2)).toBeLessThanOrEqual(2);
    // Fills the safe area on the limiting axis (80% width or 84% height).
    const boxW = box!.x1 - box!.x0 + 1;
    const boxH = box!.y1 - box!.y0 + 1;
    const fill = Math.max(boxW / (PRESET.width * 0.8), boxH / (PRESET.height * 0.84));
    expect(fill).toBeGreaterThan(0.95);
    // Interior product pixels carry the exact source color (bit-for-bit path):
    // noise=3 jitters the fixture, so allow only that same jitter here.
    const center = out.px(Math.round(cx), Math.round(cy));
    expect(Math.abs(center.r - RED.r)).toBeLessThanOrEqual(3);
    expect(Math.abs(center.g - RED.g)).toBeLessThanOrEqual(3);
    expect(Math.abs(center.b - RED.b)).toBeLessThanOrEqual(3);
  });

  it("preserves interior pixels bit-for-bit when no scaling is needed", async () => {
    // Rect already sized to the safe area of the preset → scale = 1.
    const input = await fixture({
      width: PRESET.width,
      height: PRESET.height,
      bg: WHITE,
      rect: { left: 47, top: 75, width: 376, height: 500, color: RED }, // 376 = 470 × 0.8 → scale 1
    });
    const outcome = await deterministicCompose(input, PRESET);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.stats.scale).toBeCloseTo(1, 5);
    const out = await decodeResult(outcome.image);
    const box = findBox(out, RED, 0);
    expect(box).toBeTruthy();
    // Exact color match inside the product — untouched bytes.
    const mid = out.px(Math.round((box!.x0 + box!.x1) / 2), Math.round((box!.y0 + box!.y1) / 2));
    expect(mid).toEqual(RED);
  });

  it("never upscales beyond the 2× cap", async () => {
    const input = await fixture({
      width: 900,
      height: 1200,
      bg: WHITE,
      rect: { left: 405, top: 540, width: 90, height: 120, color: RED }, // 1% coverage, needs >4× to fill
    });
    const outcome = await deterministicCompose(input, PRESET);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.stats.scale).toBeLessThanOrEqual(2);
  });

  it("refuses a gradient background", async () => {
    const width = 400, height = 500;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      const shade = Math.round(120 + (y / height) * 120); // vertical gradient
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        raw[i] = shade;
        raw[i + 1] = shade;
        raw[i + 2] = shade;
      }
    }
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const outcome = await deterministicCompose(
      { data: png.toString("base64"), mimeType: "image/png" },
      PRESET
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain("не однотонний");
  });

  it("refuses when the product fills nearly the whole frame", async () => {
    const input = await fixture({
      width: 400,
      height: 500,
      bg: WHITE,
      rect: { left: 2, top: 2, width: 396, height: 496, color: RED },
    });
    const outcome = await deterministicCompose(input, PRESET);
    expect(outcome.ok).toBe(false);
  });

  it("refuses an empty frame (no product found)", async () => {
    const input = await fixture({
      width: 400,
      height: 500,
      bg: WHITE,
      rect: { left: 0, top: 0, width: 0, height: 0, color: RED },
    });
    const outcome = await deterministicCompose(input, PRESET);
    expect(outcome.ok).toBe(false);
  });
});

describe("finalizeGenerated", () => {
  it("normalizes a near-target model output to the exact hex, size and centering", async () => {
    // Model returned 1000×1400 with an "almost #E9E9E9" background and an
    // off-center product — the realistic Gemini output shape.
    const input = await fixture({
      width: 1000,
      height: 1400,
      bg: { r: 0xe7, g: 0xe8, b: 0xeb },
      rect: { left: 120, top: 200, width: 400, height: 700, color: RED },
      noise: 2,
    });
    const result = await finalizeGenerated(input, PRESET);
    expect(result.method).toBe("recompose");
    const out = await decodeResult(result.image);
    expect(out.width).toBe(PRESET.width);
    expect(out.height).toBe(PRESET.height);
    expect(out.px(0, 0)).toEqual({ r: 0xe9, g: 0xe9, b: 0xe9 });
    const box = findBox(out, RED, 12);
    expect(box).toBeTruthy();
    expect(Math.abs((box!.x0 + box!.x1) / 2 - PRESET.width / 2)).toBeLessThanOrEqual(2);
  });

  it("degrades to a contain-resize when the background is not uniform", async () => {
    const width = 600, height = 800;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      const shade = Math.round(80 + (y / height) * 160);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        raw[i] = shade;
        raw[i + 1] = shade;
        raw[i + 2] = shade;
      }
    }
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const result = await finalizeGenerated(
      { data: png.toString("base64"), mimeType: "image/png" },
      PRESET
    );
    expect(result.method).toBe("resize");
    const out = await decodeResult(result.image);
    expect(out.width).toBe(PRESET.width);
    expect(out.height).toBe(PRESET.height);
  });
});
