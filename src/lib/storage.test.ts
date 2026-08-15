import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { saveResult } from "./storage";
import { DEFAULT_PRESET_PROMPT, type Preset } from "./preset-schema";

const preset: Preset = {
  id: "default",
  name: "Основний магазин",
  width: 940,
  height: 1300,
  background: "#E9E9E9",
  aspectRatio: "3:4",
  outputDir: "~/CatalogPhotos/default",
  prompt: DEFAULT_PRESET_PROMPT,
};
const PNG_BASE64 = Buffer.from("fake-png-bytes").toString("base64");

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
});

describe("saveResult", () => {
  it("writes <slug>.png into the folder", async () => {
    const { filePath } = await saveResult(
      { imageBase64: PNG_BASE64, filenameBase: "ab-123", preset },
      dir
    );
    expect(filePath).toBe(path.join(dir, "ab-123.png"));
    const written = await fs.readFile(filePath);
    expect(written.toString()).toBe("fake-png-bytes");
  });

  it("adds numeric suffix on collision", async () => {
    await saveResult({ imageBase64: PNG_BASE64, filenameBase: "ab-123", preset }, dir);
    const second = await saveResult({ imageBase64: PNG_BASE64, filenameBase: "ab-123", preset }, dir);
    expect(second.filePath).toBe(path.join(dir, "ab-123-1.png"));
  });

  it("appends a JSONL log entry with inputs and output path", async () => {
    await saveResult(
      {
        imageBase64: PNG_BASE64,
        filenameBase: "ab-123",
        preset,
        promptUsed: "the prompt",
        sku: "AB-123",
        productName: "Боді",
      },
      dir
    );
    const log = await fs.readFile(path.join(dir, "log.jsonl"), "utf8");
    const entry = JSON.parse(log.trim().split("\n")[0]);
    expect(entry.file).toBe("ab-123.png");
    expect(entry.filePath).toBe(path.join(dir, "ab-123.png"));
    expect(entry.prompt).toBe("the prompt");
    expect(entry.sku).toBe("AB-123");
    expect(entry.productName).toBe("Боді");
    expect(entry.timestamp).toBeTruthy();
  });

  it("compresses real PNG images before writing", async () => {
    const sharp = (await import("sharp")).default;
    const width = 200;
    const height = 200;
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = i % 251;
    const png = await sharp(raw, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();

    const { filePath } = await saveResult(
      { imageBase64: png.toString("base64"), filenameBase: "compressed", preset },
      dir
    );
    const written = await fs.readFile(filePath);
    expect(written.length).toBeLessThan(png.length);
    const meta = await sharp(written).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(width);
  });

  it("creates missing nested folders", async () => {
    const nested = path.join(dir, "a", "b");
    const { filePath } = await saveResult(
      { imageBase64: PNG_BASE64, filenameBase: "x", preset },
      nested
    );
    expect(filePath).toBe(path.join(nested, "x.png"));
  });
});
