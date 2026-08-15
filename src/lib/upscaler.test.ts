import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { upscaleImage } from "./upscaler";

const IMG = { data: "bWFpbg==", mimeType: "image/jpeg" };
const RESULT_FILE = { url: "data:image/png;base64,Ymln", content_type: "image/png" };

function fakeSubscribe(image: unknown, calls: unknown[]) {
  return (async (endpoint: string, opts: unknown) => {
    calls.push([endpoint, opts]);
    return { data: { image }, requestId: "r1" };
  }) as never;
}

beforeEach(() => vi.stubEnv("FAL_KEY", "test-key"));
afterEach(() => vi.unstubAllEnvs());

describe("upscaleImage", () => {
  it("sends the image as a data URI and parses the upscaled result", async () => {
    const calls: any[] = [];
    const out = await upscaleImage("fal-ai/recraft/upscale/crisp", IMG, {
      subscribe: fakeSubscribe(RESULT_FILE, calls),
    });
    expect(out).toEqual({ data: "Ymln", mimeType: "image/png" });
    const [endpoint, opts] = calls[0];
    expect(endpoint).toBe("fal-ai/recraft/upscale/crisp");
    expect(opts.input.image_url).toBe("data:image/jpeg;base64,bWFpbg==");
    expect(opts.input.model).toBeUndefined();
  });

  it("topaz gets the photo-faithful model and png output", async () => {
    const calls: any[] = [];
    await upscaleImage("fal-ai/topaz/upscale/image", IMG, {
      subscribe: fakeSubscribe(RESULT_FILE, calls),
    });
    expect(calls[0][1].input.model).toBe("Standard V2");
    expect(calls[0][1].input.output_format).toBe("png");
  });

  it("throws a Ukrainian error when no image comes back", async () => {
    await expect(
      upscaleImage("fal-ai/recraft/upscale/crisp", IMG, {
        subscribe: fakeSubscribe(undefined, []),
      })
    ).rejects.toThrow(/не повернув зображення/);
  });
});
