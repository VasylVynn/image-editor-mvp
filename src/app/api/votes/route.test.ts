import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/votes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/votes")>();
  return {
    ...actual,
    appendVote: vi.fn(async () => {}),
    loadVotes: vi.fn(async () => [
      { timestamp: "t", engineId: "gemini", vote: "up" },
      { timestamp: "t", engineId: "gemini", vote: "up" },
      { timestamp: "t", engineId: "fal-seedream", vote: "down" },
    ]),
  };
});

import { GET, POST } from "./route";
import { appendVote } from "@/lib/votes";

function makePost(body: unknown) {
  return new Request("http://localhost/api/votes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/votes", () => {
  it("returns the sorted summary and total", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.summary[0]).toEqual({ engineId: "gemini", up: 2, down: 0 });
  });
});

describe("POST /api/votes", () => {
  it("stores a valid vote", async () => {
    const res = await POST(makePost({ engineId: "gemini", vote: "up", presetId: "default" }));
    expect(res.status).toBe(200);
    expect(appendVote).toHaveBeenCalledWith({
      engineId: "gemini",
      vote: "up",
      presetId: "default",
    });
  });

  it("rejects unknown engines and bad vote values", async () => {
    expect((await POST(makePost({ engineId: "nope", vote: "up" }))).status).toBe(400);
    expect((await POST(makePost({ engineId: "gemini", vote: "meh" }))).status).toBe(400);
    expect(appendVote).not.toHaveBeenCalled();
  });
});
