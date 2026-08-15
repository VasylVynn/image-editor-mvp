import { describe, it, expect } from "vitest";
import { inflateSync } from "zlib";
import { solidColorPng, colorSwatchImage } from "./color-swatch";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("solidColorPng", () => {
  it("produces a valid PNG with the requested dimensions and color", () => {
    const png = solidColorPng("#E9E9E9", 8);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    // IHDR data starts at offset 16 (8 sig + 4 len + 4 type)
    expect(png.readUInt32BE(16)).toBe(8); // width
    expect(png.readUInt32BE(20)).toBe(8); // height
    // IDAT chunk sits right after the 25-byte IHDR chunk (offset 33)
    const idatLength = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString("ascii")).toBe("IDAT");
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    // First scanline: filter byte 0, then RGB pixels of the color
    expect(raw[0]).toBe(0);
    expect([raw[1], raw[2], raw[3]]).toEqual([0xe9, 0xe9, 0xe9]);
  });

  it("accepts hex without the # prefix and rejects garbage", () => {
    expect(() => solidColorPng("FFFFFF", 4)).not.toThrow();
    expect(() => solidColorPng("gray")).toThrow(/Invalid hex/);
    expect(() => solidColorPng("#FFF")).toThrow(/Invalid hex/);
  });

  it("colorSwatchImage wraps the png as a base64 ImageInput", () => {
    const image = colorSwatchImage("#000000");
    expect(image.mimeType).toBe("image/png");
    expect(Buffer.from(image.data, "base64").subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });
});
