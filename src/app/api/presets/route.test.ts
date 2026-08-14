import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_PRESET_PROMPT, type Preset } from "@/lib/preset-schema";

const VALID: Preset = {
  id: "default",
  name: "Основний магазин",
  width: 940,
  height: 1300,
  background: "#E9E9E9",
  aspectRatio: "3:4",
  outputDir: "~/CatalogPhotos/default",
  prompt: DEFAULT_PRESET_PROMPT,
};

vi.mock("@/lib/presets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/presets")>();
  return {
    ...actual,
    loadPresets: vi.fn(async () => [VALID]),
    savePresets: vi.fn(async () => {}),
  };
});

import { GET, PUT } from "./route";
import { loadPresets, savePresets } from "@/lib/presets";

function makePut(body: unknown) {
  return new Request("http://localhost/api/presets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/presets", () => {
  it("returns the preset list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.presets).toEqual([VALID]);
  });

  it("500 with message when loading fails", async () => {
    vi.mocked(loadPresets).mockRejectedValueOnce(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("boom");
  });
});

describe("PUT /api/presets", () => {
  it("saves a valid list", async () => {
    const res = await PUT(makePut({ presets: [VALID] }));
    expect(res.status).toBe(200);
    expect(savePresets).toHaveBeenCalledWith([VALID]);
    expect((await res.json()).presets).toEqual([VALID]);
  });

  it("400 with Ukrainian errors on invalid presets, does not save", async () => {
    const res = await PUT(makePut({ presets: [{ ...VALID, background: "gray" }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("hex");
    expect(savePresets).not.toHaveBeenCalled();
  });

  it("400 on missing presets field", async () => {
    const res = await PUT(makePut({}));
    expect(res.status).toBe(400);
    expect(savePresets).not.toHaveBeenCalled();
  });

  it("500 when the write fails", async () => {
    vi.mocked(savePresets).mockRejectedValueOnce(new Error("disk full"));
    const res = await PUT(makePut({ presets: [VALID] }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("disk full");
  });
});
