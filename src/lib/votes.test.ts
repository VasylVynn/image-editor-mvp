import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { appendVote, loadVotes, summarizeVotes } from "./votes";

let votesPath: string;
beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "votes-test-"));
  votesPath = path.join(dir, "votes.jsonl");
});

describe("votes storage", () => {
  it("appends and loads votes with timestamps", async () => {
    await appendVote({ engineId: "gemini", vote: "up", presetId: "default" }, votesPath);
    await appendVote({ engineId: "fal-seedream", vote: "down" }, votesPath);
    const votes = await loadVotes(votesPath);
    expect(votes).toHaveLength(2);
    expect(votes[0].engineId).toBe("gemini");
    expect(votes[0].timestamp).toBeTruthy();
    expect(votes[1].vote).toBe("down");
  });

  it("returns an empty list when the file does not exist", async () => {
    expect(await loadVotes(votesPath)).toEqual([]);
  });
});

describe("summarizeVotes", () => {
  it("tallies per engine and sorts by net score", () => {
    const summary = summarizeVotes([
      { timestamp: "t", engineId: "a", vote: "up" },
      { timestamp: "t", engineId: "a", vote: "up" },
      { timestamp: "t", engineId: "a", vote: "down" },
      { timestamp: "t", engineId: "b", vote: "up" },
      { timestamp: "t", engineId: "b", vote: "up" },
    ]);
    expect(summary[0]).toEqual({ engineId: "b", up: 2, down: 0 });
    expect(summary[1]).toEqual({ engineId: "a", up: 2, down: 1 });
  });
});
