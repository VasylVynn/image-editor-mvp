import { describe, it, expect } from "vitest";
import { ENGINES, getEngine } from "./engines";

describe("engines", () => {
  it("gemini is the first (default) engine", () => {
    expect(ENGINES[0].id).toBe("gemini");
    expect(ENGINES[0].provider).toBe("gemini");
  });

  it("every fal engine carries a falEndpoint", () => {
    for (const engine of ENGINES.filter((e) => e.provider === "fal")) {
      // Newer fal listings (e.g. bytedance/seedream/v5) drop the fal-ai/ prefix.
      expect(engine.falEndpoint).toMatch(/^(fal-ai|bytedance)\//);
    }
  });

  it("getEngine resolves known ids and falls back to gemini", () => {
    expect(getEngine("fal-flux-2").falEndpoint).toBe("fal-ai/flux-2/edit");
    expect(getEngine("nope").id).toBe("gemini");
    expect(getEngine(undefined).id).toBe("gemini");
    expect(getEngine(null).id).toBe("gemini");
  });
});
