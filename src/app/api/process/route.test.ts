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

import { POST } from "./route";
import { generateImage } from "@/lib/generator";
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
});
