import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { compressPng } from "./compressor";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function makePhotoLikePng(): Promise<Buffer> {
  const width = 300;
  const height = 300;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = x % 256;
      raw[i + 1] = y % 256;
      raw[i + 2] = (x + y) % 256;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("compressPng", () => {
  it("produces a smaller, still-valid PNG with same dimensions", async () => {
    const original = await makePhotoLikePng();
    const compressed = await compressPng(original);
    expect(compressed.length).toBeLessThan(original.length);
    expect(compressed.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    const meta = await sharp(compressed).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(300);
  });

  it("returns the original buffer for invalid image data", async () => {
    const junk = Buffer.from("not-a-png");
    const out = await compressPng(junk);
    expect(out).toBe(junk);
  });

  it("never returns a larger buffer than the input", async () => {
    const tiny = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const out = await compressPng(tiny);
    expect(out.length).toBeLessThanOrEqual(tiny.length);
  });
});
