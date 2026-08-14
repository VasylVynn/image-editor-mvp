import { describe, it, expect } from "vitest";
import os from "os";
import { listPresets, getPreset, resolveOutputDir } from "./presets";

describe("presets", () => {
  it("lists at least the default preset", () => {
    const presets = listPresets();
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.map((p) => p.id)).toContain("default");
  });

  it("default preset matches the store requirements", () => {
    const p = getPreset("default");
    expect(p.width).toBe(940);
    expect(p.height).toBe(1300);
    expect(p.background).toBe("#E9E9E9");
    expect(p.aspectRatio).toBe("3:4");
  });

  it("throws on unknown preset id", () => {
    expect(() => getPreset("nope")).toThrow(/Unknown preset/);
  });

  it("expands ~ in outputDir", () => {
    const p = getPreset("default");
    const dir = resolveOutputDir(p);
    expect(dir.startsWith(os.homedir())).toBe(true);
    expect(dir).not.toContain("~");
  });
});
