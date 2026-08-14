import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { loadPresets, getPreset, savePresets, resolveOutputDir } from "./presets";
import { validatePresets, DEFAULT_PRESET_PROMPT, type Preset } from "./preset-schema";

const VALID: Preset = {
  id: "default",
  name: "Основний магазин",
  width: 940,
  height: 1300,
  background: "#E9E9E9",
  aspectRatio: "3:4",
  outputDir: "~/CatalogPhotos/default",
  prompt: DEFAULT_PRESET_PROMPT,
};

let tmpPath: string;
beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "presets-test-"));
  tmpPath = path.join(dir, "presets.json");
  await fs.writeFile(tmpPath, JSON.stringify({ presets: [VALID] }));
});

describe("loadPresets / getPreset", () => {
  it("loads the real default config with the store requirements", async () => {
    const presets = await loadPresets();
    const def = presets.find((p) => p.id === "default");
    expect(def).toBeTruthy();
    expect(def!.background).toBe("#E9E9E9");
    expect(def!.aspectRatio).toBe("3:4");
  });

  it("getPreset finds by id and throws on unknown", async () => {
    const preset = await getPreset("default", tmpPath);
    expect(preset.width).toBe(940);
    await expect(getPreset("nope", tmpPath)).rejects.toThrow(/Unknown preset/);
  });

  it("throws on a corrupted file shape", async () => {
    await fs.writeFile(tmpPath, JSON.stringify({ wrong: true }));
    await expect(loadPresets(tmpPath)).rejects.toThrow(/пошкоджено/);
  });

  it("backfills a default prompt for presets saved before the field existed", async () => {
    const legacy: Partial<Preset> = { ...VALID };
    delete legacy.prompt;
    await fs.writeFile(tmpPath, JSON.stringify({ presets: [legacy] }));
    const [loaded] = await loadPresets(tmpPath);
    expect(loaded.prompt).toBe(DEFAULT_PRESET_PROMPT);
  });
});

describe("savePresets", () => {
  it("round-trips presets through the file", async () => {
    const second: Preset = { ...VALID, id: "shop2", name: "Другий", background: "#FFFFFF" };
    await savePresets([VALID, second], tmpPath);
    const loaded = await loadPresets(tmpPath);
    expect(loaded).toEqual([VALID, second]);
  });

  it("rejects invalid presets and leaves the file untouched", async () => {
    const bad = { ...VALID, background: "gray" };
    await expect(savePresets([bad], tmpPath)).rejects.toThrow(/hex/);
    const loaded = await loadPresets(tmpPath);
    expect(loaded).toEqual([VALID]);
  });
});

describe("validatePresets", () => {
  it("accepts a valid list", () => {
    expect(validatePresets([VALID])).toEqual([]);
  });

  it("rejects an empty list", () => {
    expect(validatePresets([])).toEqual(["Потрібен щонайменше один пресет"]);
  });

  it("rejects duplicate ids", () => {
    const errors = validatePresets([VALID, { ...VALID, name: "Копія" }]);
    expect(errors.join(" ")).toContain("повторюється");
  });

  it("rejects bad hex, bad aspect ratio and non-positive size", () => {
    const errors = validatePresets([
      { ...VALID, background: "#FFF", aspectRatio: "2:3", width: 0 },
    ]);
    expect(errors.join(" ")).toContain("hex");
    expect(errors.join(" ")).toContain("співвідношення");
    expect(errors.join(" ")).toContain("ширина");
  });

  it("handles malformed entries (null, wrong types) without throwing", () => {
    const errors = validatePresets([null, { ...VALID, id: 123, width: "940" }] as never);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain("порожній id");
    expect(errors.join(" ")).toContain("ширина");
  });

  it("rejects blank name, outputDir and prompt", () => {
    const errors = validatePresets([{ ...VALID, name: " ", outputDir: "", prompt: "  " }]);
    expect(errors.join(" ")).toContain("назву");
    expect(errors.join(" ")).toContain("папку");
    expect(errors.join(" ")).toContain("інструкцію");
  });
});

describe("resolveOutputDir", () => {
  it("expands ~ into the home directory", () => {
    const dir = resolveOutputDir(VALID);
    expect(dir.startsWith(os.homedir())).toBe(true);
    expect(dir).not.toContain("~");
  });
});
