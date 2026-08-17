import { describe, it, expect } from "vitest";
import { ENGINES, getEngine, priceTier } from "./engines";

describe("engines", () => {
  it("gemini is the first (default) engine", () => {
    expect(ENGINES[0].id).toBe("gemini");
    expect(ENGINES[0].provider).toBe("gemini");
  });

  it("every fal engine carries a falEndpoint", () => {
    for (const engine of ENGINES.filter((e) => e.provider === "fal")) {
      // Newer fal listings (bytedance/seedream/v5, openai/gpt-image-2) drop the fal-ai/ prefix.
      expect(engine.falEndpoint).toMatch(/^(fal-ai|bytedance|openai)\//);
    }
  });

  it("priceTier maps cost to $, $$, $$$", () => {
    expect(priceTier(0.035)).toBe("$");
    expect(priceTier(0.05)).toBe("$");
    expect(priceTier(0.07)).toBe("$$");
    expect(priceTier(0.09)).toBe("$$");
    expect(priceTier(0.13)).toBe("$$$");
  });

  it("getEngine resolves known ids and falls back to gemini", () => {
    expect(getEngine("fal-seedream").falEndpoint).toBe("fal-ai/bytedance/seedream/v4.5/edit");
    expect(getEngine("nope").id).toBe("gemini");
    expect(getEngine(undefined).id).toBe("gemini");
    expect(getEngine(null).id).toBe("gemini");
  });
});
