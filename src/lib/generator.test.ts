import { describe, it, expect } from "vitest";
import { generateImage, GENERATION_MODEL } from "./generator";

const MAIN = { data: "bWFpbg==", mimeType: "image/jpeg" };
const REF = { data: "cmVm", mimeType: "image/png" };

function fakeAI(parts: unknown[], calls: unknown[]) {
  return {
    models: {
      generateContent: async (req: unknown) => {
        calls.push(req);
        return { candidates: [{ content: { parts } }] };
      },
    },
  } as never;
}

describe("generateImage", () => {
  it("sends main image, prompt and image config", async () => {
    const calls: any[] = [];
    const out = await generateImage(
      { mainImage: MAIN, prompt: "edit it", aspectRatio: "3:4" },
      { genAI: () => fakeAI([{ inlineData: { data: "cmVzdWx0", mimeType: "image/png" } }], calls) }
    );
    expect(out).toEqual({ data: "cmVzdWx0", mimeType: "image/png" });
    const req = calls[0];
    expect(req.model).toBe(GENERATION_MODEL);
    const parts = req.contents[0].parts;
    expect(parts).toHaveLength(2); // main + text
    expect(parts[1].text).toBe("edit it");
    expect(req.config.imageConfig.aspectRatio).toBe("3:4");
    expect(req.config.responseModalities).toContain("IMAGE");
  });

  it("includes reference image between main and prompt when provided", async () => {
    const calls: any[] = [];
    await generateImage(
      { mainImage: MAIN, referenceImage: REF, prompt: "edit", aspectRatio: "3:4" },
      { genAI: () => fakeAI([{ inlineData: { data: "eA==", mimeType: "image/png" } }], calls) }
    );
    const parts = calls[0].contents[0].parts;
    expect(parts).toHaveLength(3);
    expect(parts[1].inlineData.data).toBe(REF.data);
  });

  it("throws with model text when no image comes back", async () => {
    await expect(
      generateImage(
        { mainImage: MAIN, prompt: "edit", aspectRatio: "3:4" },
        { genAI: () => fakeAI([{ text: "I cannot do that" }], []) }
      )
    ).rejects.toThrow(/I cannot do that/);
  });

  it("passes a custom imageSize tier through, defaulting to 2K", async () => {
    const calls: any[] = [];
    const ai = () =>
      fakeAI([{ inlineData: { data: "eA==", mimeType: "image/png" } }], calls);
    await generateImage({ mainImage: MAIN, prompt: "edit", aspectRatio: "3:4" }, { genAI: ai });
    expect(calls[0].config.imageConfig.imageSize).toBe("2K");
    await generateImage(
      { mainImage: MAIN, prompt: "edit", aspectRatio: "3:4", imageSize: "1K" },
      { genAI: ai }
    );
    expect(calls[1].config.imageConfig.imageSize).toBe("1K");
  });

  it("defaults mimeType to image/png when missing", async () => {
    const out = await generateImage(
      { mainImage: MAIN, prompt: "edit", aspectRatio: "3:4" },
      { genAI: () => fakeAI([{ inlineData: { data: "eQ==" } }], []) }
    );
    expect(out.mimeType).toBe("image/png");
  });
});
