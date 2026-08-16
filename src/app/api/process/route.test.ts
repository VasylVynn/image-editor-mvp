import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/generator", () => ({
  generateImage: vi.fn(async () => ({ data: "cmVzdWx0", mimeType: "image/png" })),
}));
vi.mock("@/lib/analyzer", () => ({
  analyzeImages: vi.fn(async () => ({
    itemCount: 1,
    items: ["dress"],
    criticalDetails: ["bow on collar"],
  })),
  formatAnalysis: vi.fn(() => "FORMATTED ANALYSIS"),
}));
vi.mock("@/lib/product-fetcher", () => ({
  downloadImage: vi.fn(async () => ({ data: "ZnJvbVVybA==", mimeType: "image/jpeg" })),
}));
vi.mock("@/lib/fal-generator", () => ({
  generateWithFal: vi.fn(async () => ({ data: "ZmFs", mimeType: "image/png" })),
}));
vi.mock("@/lib/upscaler", () => ({
  upscaleImage: vi.fn(async () => ({ data: "YmlnZ2Vy", mimeType: "image/png" })),
}));

import { POST } from "./route";
import { generateImage } from "@/lib/generator";
import { generateWithFal } from "@/lib/fal-generator";
import { upscaleImage } from "@/lib/upscaler";
import { analyzeImages } from "@/lib/analyzer";

function makeRequest(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request("http://localhost/api/process", { method: "POST", body: fd });
}

const pngFile = () => new File([Buffer.from("img")], "a.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/process", () => {
  it("400 when image is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("400 on disallowed mime type", async () => {
    const bad = new File([Buffer.from("x")], "a.gif", { type: "image/gif" });
    const res = await POST(makeRequest({ image: bad }));
    expect(res.status).toBe(400);
  });

  it("413 on oversize file", async () => {
    const big = new File([Buffer.alloc(11 * 1024 * 1024)], "a.png", { type: "image/png" });
    const res = await POST(makeRequest({ image: big }));
    expect(res.status).toBe(413);
  });

  it("returns data URL and prompt containing analysis", async () => {
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.image).toBe("data:image/png;base64,cmVzdWx0");
    expect(body.analysis).toBe("FORMATTED ANALYSIS");
    expect(body.analysisFailed).toBe(false);
    expect(body.promptUsed).toContain("FORMATTED ANALYSIS");
  });

  it("skips analysis when analyze=false", async () => {
    const res = await POST(makeRequest({ image: pngFile(), analyze: "false" }));
    expect(res.status).toBe(200);
    expect(analyzeImages).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.analysis).toBeNull();
  });

  it("falls back to base prompt when analysis fails", async () => {
    vi.mocked(analyzeImages).mockRejectedValueOnce(new Error("boom"));
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysisFailed).toBe(true);
    expect(body.analysis).toBeNull();
  });

  it("passes reference image to generator", async () => {
    const res = await POST(makeRequest({ image: pngFile(), reference: pngFile() }));
    expect(res.status).toBe(200);
    const arg = vi.mocked(generateImage).mock.calls[0][0];
    expect(arg.referenceImage).toBeTruthy();
  });

  it("500 with error message when generation fails", async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error("model down"));
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("model down");
  });

  it("maps a 429/RESOURCE_EXHAUSTED generation error to a Ukrainian quota message", async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(
      new Error('429 RESOURCE_EXHAUSTED. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}')
    );
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Вичерпано ліміт або кошти API моделі — поповніть білінг");
    expect(body.details).toContain("RESOURCE_EXHAUSTED");
  });

  it("keeps an unrecognized generation error message as passthrough (default case)", async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error("something unexpected happened"));
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("something unexpected happened");
    expect(body.details).toBeUndefined();
  });

  it("maps an auth/API key generation error to a Ukrainian message", async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error("401 Unauthorized: invalid API key"));
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Проблема з API-ключем моделі — перевірте GEMINI_API_KEY / FAL_KEY");
  });

  it("maps a 5xx/network generation error to a Ukrainian unavailable message", async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error("fetch failed: 503 Service Unavailable"));
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Сервіс генерації недоступний. Спробуйте ще раз");
  });

  it("maps a timeout generation error to a Ukrainian message", async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error("Gemini generation timeout after 120000ms"));
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Перевищено час очікування. Спробуйте ще раз");
  });

  it("accepts imageUrl instead of file", async () => {
    const res = await POST(makeRequest({ imageUrl: "https://cdn.shop.ua/i.jpg" }));
    expect(res.status).toBe(200);
  });

  it("file wins over imageUrl when both present", async () => {
    const res = await POST(makeRequest({ image: pngFile(), imageUrl: "https://x/y.jpg" }));
    expect(res.status).toBe(200);
    const arg = vi.mocked(generateImage).mock.calls[0][0];
    expect(arg.mainImage.data).not.toBe("ZnJvbVVybA==");
  });

  it("dispatches to fal with the engine endpoint and preset dimensions", async () => {
    const res = await POST(makeRequest({ image: pngFile(), model: "fal-flux-2" }));
    expect(res.status).toBe(200);
    expect(generateWithFal).toHaveBeenCalledWith(
      "fal-ai/flux-2/edit",
      expect.objectContaining({
        targetWidth: 940,
        targetHeight: 1300,
        backgroundSwatch: expect.objectContaining({ mimeType: "image/png" }),
      })
    );
    const falArg = vi.mocked(generateWithFal).mock.calls[0][1];
    expect(falArg.prompt).toContain("last attached image"); // reference color mode
    expect(falArg.prompt).not.toContain("#E9E9E9");
    expect(generateImage).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.image).toBe("data:image/png;base64,ZmFs");
  });

  it("nano-banana-2 runs at 1K and gets post-upscaled to full size", async () => {
    const res = await POST(makeRequest({ image: pngFile(), model: "fal-nano-banana-2" }));
    expect(res.status).toBe(200);
    const falArg = vi.mocked(generateWithFal).mock.calls[0][1];
    expect(falArg.imageSize).toBe("1K");
    expect(upscaleImage).toHaveBeenCalledWith(
      "fal-ai/recraft/upscale/crisp",
      expect.objectContaining({ data: "ZmFs" }) // the generated result, not the source
    );
    const body = await res.json();
    expect(body.image).toBe("data:image/png;base64,YmlnZ2Vy"); // upscaled bytes
  });

  it("unknown model id falls back to the Gemini engine", async () => {
    const res = await POST(makeRequest({ image: pngFile(), model: "nope" }));
    expect(res.status).toBe(200);
    expect(generateImage).toHaveBeenCalled();
    expect(generateWithFal).not.toHaveBeenCalled();
  });

  it("passes extra references through to generation and flags them in the prompt", async () => {
    const fd = new FormData();
    fd.append("image", pngFile());
    fd.append("extra", pngFile());
    fd.append("extra", pngFile());
    const res = await POST(new Request("http://localhost/api/process", { method: "POST", body: fd }));
    expect(res.status).toBe(200);
    const arg = vi.mocked(generateImage).mock.calls[0][0];
    expect(arg.extraImages).toHaveLength(2);
    expect(arg.prompt).toContain("2 additional reference images");
  });

  it("caps extra references at 4", async () => {
    const fd = new FormData();
    fd.append("image", pngFile());
    for (let i = 0; i < 6; i++) fd.append("extra", pngFile());
    const res = await POST(new Request("http://localhost/api/process", { method: "POST", body: fd }));
    expect(res.status).toBe(200);
    expect(vi.mocked(generateImage).mock.calls[0][0].extraImages).toHaveLength(4);
  });

  it("upscales the main image before generation when upscale=true", async () => {
    const res = await POST(
      makeRequest({ image: pngFile(), upscale: "true", upscaler: "topaz" })
    );
    expect(res.status).toBe(200);
    expect(upscaleImage).toHaveBeenCalledWith(
      "fal-ai/topaz/upscale/image",
      expect.objectContaining({ mimeType: "image/png" })
    );
    const genArg = vi.mocked(generateImage).mock.calls[0][0];
    expect(genArg.mainImage.data).toBe("YmlnZ2Vy"); // the upscaled bytes
    const body = await res.json();
    expect(body.upscaleFailed).toBe(false);
  });

  it("skips upscaling when the checkbox is off", async () => {
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(200);
    expect(upscaleImage).not.toHaveBeenCalled();
  });

  it("falls back to the original image when upscaling fails", async () => {
    vi.mocked(upscaleImage).mockRejectedValueOnce(new Error("upscaler down"));
    const res = await POST(makeRequest({ image: pngFile(), upscale: "true" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upscaleFailed).toBe(true);
    expect(generateImage).toHaveBeenCalled(); // generation still ran
  });
});
