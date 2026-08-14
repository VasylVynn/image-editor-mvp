import { describe, it, expect } from "vitest";
import { analyzeImages, formatAnalysis, ANALYZER_MODEL } from "./analyzer";
import type { AnalysisResult } from "./types";

const IMG = { data: "aGVsbG8=", mimeType: "image/png" };

function fakeAI(responseText: string | undefined, calls: unknown[]) {
  return {
    models: {
      generateContent: async (req: unknown) => {
        calls.push(req);
        return { text: responseText };
      },
    },
  } as never;
}

describe("analyzeImages", () => {
  const stub: AnalysisResult = {
    itemCount: 2,
    items: ["bodysuit", "pants"],
    criticalDetails: ["4 wooden buttons", "bear print on chest"],
  };

  it("sends images plus instruction and parses JSON response", async () => {
    const calls: any[] = [];
    const result = await analyzeImages([IMG, IMG], { genAI: () => fakeAI(JSON.stringify(stub), calls) });
    expect(result).toEqual(stub);
    const req = calls[0];
    expect(req.model).toBe(ANALYZER_MODEL);
    const parts = req.contents[0].parts;
    expect(parts).toHaveLength(3); // 2 images + 1 text
    expect(parts[0].inlineData.data).toBe(IMG.data);
    expect(parts[2].text).toBeTruthy();
    expect(req.config.responseMimeType).toBe("application/json");
  });

  it("throws when model returns no text", async () => {
    await expect(
      analyzeImages([IMG], { genAI: () => fakeAI(undefined, []) })
    ).rejects.toThrow(/no text/i);
  });
});

describe("formatAnalysis", () => {
  it("renders item count, items and details as a prompt fragment", () => {
    const text = formatAnalysis({
      itemCount: 2,
      items: ["bodysuit", "pants"],
      criticalDetails: ["4 wooden buttons"],
    });
    expect(text).toContain("2 piece(s)");
    expect(text).toContain("bodysuit, pants");
    expect(text).toContain("- 4 wooden buttons");
  });
});
