import { describe, it, expect } from "vitest";
import { buildPrompt } from "./prompt-builder";
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

describe("buildPrompt", () => {
  it("includes format header from preset fields and the preset prompt", () => {
    const p = buildPrompt({ preset });
    expect(p).toContain("940 × 1300");
    expect(p).toContain("#E9E9E9");
    expect(p).toContain("3:4");
    expect(p).toContain("сам товар не змінюй");
  });

  it("does not tell the model to iron or re-lay the garment", () => {
    const p = buildPrompt({ preset }).toLowerCase();
    expect(p).not.toContain("ironed");
    expect(p).not.toContain("flat-lay");
    expect(p).not.toContain("випрасуван");
  });

  it("uses the preset's custom prompt when overridden", () => {
    const custom = { ...preset, prompt: "Фото на білому манекені, вигляд спереду." };
    const p = buildPrompt({ preset: custom });
    expect(p).toContain("білому манекені");
    expect(p).not.toContain("сам товар не змінюй");
  });

  it("appends analysis fragment when provided, omits section otherwise", () => {
    expect(buildPrompt({ preset, analysis: "4 wooden buttons" })).toContain("4 wooden buttons");
    expect(buildPrompt({ preset })).not.toContain("з аналізу фото");
  });

  it("appends operator note when provided, skips blank note", () => {
    expect(buildPrompt({ preset, note: "прибери вішак" })).toContain("прибери вішак");
    expect(buildPrompt({ preset, note: "   " })).not.toContain("інструкція оператора");
  });
});
