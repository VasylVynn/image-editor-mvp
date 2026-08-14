import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage", () => ({
  saveResult: vi.fn(async () => ({ filePath: "/tmp/out/ab-123.png" })),
}));

import { POST } from "./route";
import { saveResult } from "@/lib/storage";

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
