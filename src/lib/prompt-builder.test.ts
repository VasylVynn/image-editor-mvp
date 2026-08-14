import { describe, it, expect } from "vitest";
import { buildPrompt } from "./prompt-builder";
import { getPreset } from "./presets";

const preset = getPreset("default");

describe("buildPrompt", () => {
  it("includes background, size and preservation rules", () => {
    const p = buildPrompt({ preset });
    expect(p).toContain("#E9E9E9");
    expect(p).toContain("940");
    expect(p).toContain("1300");
    expect(p.toLowerCase()).toContain("do not change the product");
  });

  it("appends analysis fragment when provided", () => {
    const p = buildPrompt({ preset, analysis: "4 wooden buttons" });
    expect(p).toContain("4 wooden buttons");
  });

  it("omits analysis section when not provided", () => {
    const p = buildPrompt({ preset });
    expect(p).not.toContain("observed details");
  });

  it("appends operator note when provided, skips blank note", () => {
    expect(buildPrompt({ preset, note: "прибери вішак" })).toContain("прибери вішак");
    expect(buildPrompt({ preset, note: "   " })).not.toContain("operator instruction");
  });
});
