import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage", () => ({
  saveResult: vi.fn(async () => ({ filePath: "/tmp/out/ab-123.png" })),
}));
vi.mock("@/lib/events", () => ({
  appendEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/upscaler", () => ({
  upscaleImage: vi.fn(async () => ({ data: "YmlnZ2Vy", mimeType: "image/png" })),
}));

import { POST } from "./route";
import { saveResult } from "@/lib/storage";
import { appendEvent } from "@/lib/events";
import { upscaleImage } from "@/lib/upscaler";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/save", () => {
  it("400 when image missing", async () => {
    const res = await POST(makeRequest({ sku: "AB-1" }));
    expect(res.status).toBe(400);
  });

  it("400 when no sku and no product name", async () => {
    const res = await POST(makeRequest({ image: "aGk=" }));
    expect(res.status).toBe(400);
  });

  it("saves with slugged sku and strips data URL prefix", async () => {
    const res = await POST(
      makeRequest({ image: "data:image/png;base64,aGk=", sku: "AB 123", promptUsed: "p" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe("/tmp/out/ab-123.png");
    const arg = vi.mocked(saveResult).mock.calls[0][0];
    expect(arg.imageBase64).toBe("aGk=");
    expect(arg.filenameBase).toBe("ab-123");
    expect(arg.promptUsed).toBe("p");
    expect(arg.sku).toBe("AB 123"); // raw inputs travel to the log
  });

  it("500 with error when storage fails", async () => {
    vi.mocked(saveResult).mockRejectedValueOnce(new Error("disk full"));
    const res = await POST(makeRequest({ image: "aGk=", productName: "Боді" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("disk full");
  });
});

describe("POST /api/save upscale", () => {
  const baseBody = {
    image: "data:image/png;base64,b3JpZ2luYWw=",
    sku: "SKU1",
    presetId: "default",
  };

  it("does not call the upscaler by default", async () => {
    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(200);
    expect(upscaleImage).not.toHaveBeenCalled();
    expect(vi.mocked(saveResult).mock.calls[0][0].imageBase64).toBe("b3JpZ2luYWw=");
  });

  it("upscales before saving when requested", async () => {
    const res = await POST(makeRequest({ ...baseBody, upscale: true, upscalerId: "topaz" }));
    expect(res.status).toBe(200);
    const [endpoint, image] = vi.mocked(upscaleImage).mock.calls[0];
    expect(endpoint).toBe("fal-ai/topaz/upscale/image");
    expect(image).toEqual({ data: "b3JpZ2luYWw=", mimeType: "image/png" });
    expect(vi.mocked(saveResult).mock.calls[0][0].imageBase64).toBe("YmlnZ2Vy");
    const body = await res.json();
    expect(body.upscaleFailed).toBe(false);
  });

  it("falls back to an unknown upscaler id's default endpoint", async () => {
    await POST(makeRequest({ ...baseBody, upscale: true, upscalerId: "nope" }));
    expect(vi.mocked(upscaleImage).mock.calls[0][0]).toBe("fal-ai/recraft/upscale/crisp");
  });

  it("saves the original and reports upscaleFailed when the upscaler throws", async () => {
    vi.mocked(upscaleImage).mockRejectedValueOnce(new Error("fal down"));
    const res = await POST(makeRequest({ ...baseBody, upscale: true }));
    expect(res.status).toBe(200);
    expect(vi.mocked(saveResult).mock.calls[0][0].imageBase64).toBe("b3JpZ2luYWw=");
    const body = await res.json();
    expect(body.upscaleFailed).toBe(true);
  });

  it("marks the save event as upscaled", async () => {
    await POST(makeRequest({ ...baseBody, upscale: true }));
    expect(vi.mocked(appendEvent).mock.calls[0][0]).toMatchObject({
      type: "save",
      upscaled: true,
    });
  });

  it("does not mark the save event as upscaled when the upscale failed", async () => {
    vi.mocked(upscaleImage).mockRejectedValueOnce(new Error("fal down"));
    await POST(makeRequest({ ...baseBody, upscale: true }));
    expect(vi.mocked(appendEvent).mock.calls[0][0]).toMatchObject({ type: "save" });
    expect(
      (vi.mocked(appendEvent).mock.calls[0][0] as { upscaled?: boolean }).upscaled
    ).toBeUndefined();
  });
});
