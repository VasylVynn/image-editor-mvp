import sharp from "sharp";

/**
 * Lossy tinypng-style PNG compression: palette quantization (pngquant
 * algorithm via libvips). Best-effort — returns the original buffer when the
 * input is not a decodable image or when compression would not shrink it.
 */
export async function compressPng(buffer: Buffer): Promise<Buffer> {
  try {
    const compressed = await sharp(buffer)
      .png({ palette: true, quality: 80, effort: 7 })
      .toBuffer();
    return compressed.length < buffer.length ? compressed : buffer;
  } catch (err) {
    console.warn("compressPng: falling back to original buffer", err);
    return buffer;
  }
}
