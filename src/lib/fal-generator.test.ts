import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateWithFal } from "./fal-generator";

const MAIN = { data: "bWFpbg==", mimeType: "image/jpeg" };
const REF = { data: "cmVm", mimeType: "image/png" };

const BASE_INPUT = {
  mainImage: MAIN,
  prompt: "edit it",
  aspectRatio: "3:4",
  targetWidth: 940,
  targetHeight: 1300,
};

function fakeSubscribe(images: unknown[] | undefined, calls: unknown[]) {
  return (async (endpoint: string, opts: unknown) => {
    calls.push([endpoint, opts]);
    return { data: { images }, requestId: "r1" };
  }) as never;
}

const DATA_URI_RESULT = [{ url: "data:image/png;base64,cmVzdWx0", content_type: "image/png" }];

beforeEach(() => vi.stubEnv("FAL_KEY", "test-key"));
afterEach(() => vi.unstubAllEnvs());

describe("generateWithFal", () => {
  it("sends prompt and data-URI images; nano-banana gets aspect_ratio + 2K", async () => {
    const calls: any[] = [];
    const out = await generateWithFal(
      "fal-ai/nano-banana-2/edit",
      { ...BASE_INPUT, referenceImage: REF },
      { subscribe: fakeSubscribe(DATA_URI_RESULT, calls) }
    );
    expect(out).toEqual({ data: "cmVzdWx0", mimeType: "image/png" });
    const [endpoint, opts] = calls[0];
    expect(endpoint).toBe("fal-ai/nano-banana-2/edit");
    expect(opts.input.prompt).toBe("edit it");
    expect(opts.input.image_urls).toEqual([
      "data:image/jpeg;base64,bWFpbg==",
      "data:image/png;base64,cmVm",
    ]);
    expect(opts.input.aspect_ratio).toBe("3:4");
    expect(opts.input.resolution).toBe("2K");
  });

  it("flux-2 gets exact image_size from the preset dimensions", async () => {
    const calls: any[] = [];
    await generateWithFal("fal-ai/flux-2/edit", BASE_INPUT, {
      subscribe: fakeSubscribe(DATA_URI_RESULT, calls),
    });
    expect(calls[0][1].input.image_size).toEqual({ width: 940, height: 1300 });
    expect(calls[0][1].input.aspect_ratio).toBeUndefined();
  });

  it("seedream v4.x gets doubled dimensions (its minimum side is ~1024)", async () => {
    const calls: any[] = [];
    await generateWithFal("fal-ai/bytedance/seedream/v4.5/edit", BASE_INPUT, {
      subscribe: fakeSubscribe(DATA_URI_RESULT, calls),
    });
    expect(calls[0][1].input.image_size).toEqual({ width: 1880, height: 2600 });
  });

  it("seedream v5 gets exact catalog dimensions (area already above its 1024² floor)", async () => {
    const calls: any[] = [];
    await generateWithFal("bytedance/seedream/v5/pro/edit", BASE_INPUT, {
      subscribe: fakeSubscribe(DATA_URI_RESULT, calls),
    });
    expect(calls[0][1].input.image_size).toEqual({ width: 940, height: 1300 });
  });

  it("seedream v5 doubles tiny presets to reach the area floor", async () => {
    const calls: any[] = [];
    await generateWithFal(
      "bytedance/seedream/v5/lite/edit",
      { ...BASE_INPUT, targetWidth: 600, targetHeight: 800 },
      { subscribe: fakeSubscribe(DATA_URI_RESULT, calls) }
    );
    expect(calls[0][1].input.image_size).toEqual({ width: 1200, height: 1600 });
  });

  it("qwen gets exact catalog dimensions", async () => {
    const calls: any[] = [];
    await generateWithFal("fal-ai/qwen-image-2/pro/edit", BASE_INPUT, {
      subscribe: fakeSubscribe(DATA_URI_RESULT, calls),
    });
    expect(calls[0][1].input.image_size).toEqual({ width: 940, height: 1300 });
  });

  it("throws a Ukrainian error when no image comes back", async () => {
    await expect(
      generateWithFal("fal-ai/flux-2/edit", BASE_INPUT, {
        subscribe: fakeSubscribe(undefined, []),
      })
    ).rejects.toThrow(/не повернула зображення/);
  });

  it("attaches the background swatch as the LAST image url", async () => {
    const calls: any[] = [];
    const swatch = { data: "c3dhdGNo", mimeType: "image/png" };
    await generateWithFal(
      "fal-ai/bytedance/seedream/v4.5/edit",
      { ...BASE_INPUT, referenceImage: REF, backgroundSwatch: swatch },
      { subscribe: fakeSubscribe(DATA_URI_RESULT, calls) }
    );
    const urls = calls[0][1].input.image_urls;
    expect(urls).toHaveLength(3);
    expect(urls[2]).toBe("data:image/png;base64,c3dhdGNo");
  });

  it("qwen (cap 3) drops the product reference first, keeping main + extra + swatch", async () => {
    const calls: any[] = [];
    const swatch = { data: "c3dhdGNo", mimeType: "image/png" };
    const extra = { data: "ZXh0cmE=", mimeType: "image/png" };
    await generateWithFal(
      "fal-ai/qwen-image-2/pro/edit",
      { ...BASE_INPUT, referenceImage: REF, extraImage: extra, backgroundSwatch: swatch },
      { subscribe: fakeSubscribe(DATA_URI_RESULT, calls) }
    );
    const urls = calls[0][1].input.image_urls;
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("bWFpbg=="); // main
    expect(urls[1]).toContain("ZXh0cmE="); // extra survived, ref dropped
    expect(urls[2]).toContain("c3dhdGNo"); // swatch last
  });

  it("flux-2 (cap 4) keeps main + ref + extra + swatch exactly", async () => {
    const calls: any[] = [];
    const swatch = { data: "c3dhdGNo", mimeType: "image/png" };
    const extra = { data: "ZXh0cmE=", mimeType: "image/png" };
    await generateWithFal(
      "fal-ai/flux-2/edit",
      { ...BASE_INPUT, referenceImage: REF, extraImage: extra, backgroundSwatch: swatch },
      { subscribe: fakeSubscribe(DATA_URI_RESULT, calls) }
    );
    expect(calls[0][1].input.image_urls).toHaveLength(4);
  });

  it("uploads oversized images to fal storage instead of inlining them", async () => {
    const calls: any[] = [];
    const bigImage = {
      data: Buffer.alloc(1024 * 1024, 7).toString("base64"), // 1MB > inline limit
      mimeType: "image/png",
    };
    const upload = vi.fn(async () => "https://fal.storage/big.png");
    await generateWithFal(
      "fal-ai/flux-2/edit",
      { ...BASE_INPUT, mainImage: bigImage, referenceImage: REF },
      { subscribe: fakeSubscribe(DATA_URI_RESULT, calls), upload }
    );
    expect(upload).toHaveBeenCalledTimes(1); // only the big one; small ref stays inline
    expect(calls[0][1].input.image_urls).toEqual([
      "https://fal.storage/big.png",
      "data:image/png;base64,cmVm",
    ]);
  });

  it("throws a Ukrainian error when FAL_KEY is missing", async () => {
    vi.stubEnv("FAL_KEY", "");
    await expect(
      generateWithFal("fal-ai/flux-2/edit", BASE_INPUT, {
        subscribe: fakeSubscribe(DATA_URI_RESULT, []),
      })
    ).rejects.toThrow(/FAL_KEY не налаштовано/);
  });
});
