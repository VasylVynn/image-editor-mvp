import fs from "fs/promises";
import path from "path";

// Operator votes on generation quality, one JSONL line per vote.
// Stored under data/ (gitignored) — user data, not config.

export interface VoteEntry {
  timestamp: string;
  engineId: string;
  vote: "up" | "down";
  presetId?: string;
}

export interface VoteSummary {
  engineId: string;
  up: number;
  down: number;
}

const VOTES_PATH = path.join(process.cwd(), "data", "votes.jsonl");

export async function appendVote(
  entry: Omit<VoteEntry, "timestamp">,
  votesPath: string = VOTES_PATH
): Promise<void> {
  await fs.mkdir(path.dirname(votesPath), { recursive: true });
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
  await fs.appendFile(votesPath, line + "\n");
}

export async function loadVotes(votesPath: string = VOTES_PATH): Promise<VoteEntry[]> {
  try {
    const raw = await fs.readFile(votesPath, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as VoteEntry);
  } catch {
    return []; // no votes yet
  }
}

// Sorted by net score (up - down), then by volume.
export function summarizeVotes(votes: VoteEntry[]): VoteSummary[] {
  const byEngine = new Map<string, VoteSummary>();
  for (const vote of votes) {
    const entry = byEngine.get(vote.engineId) ?? { engineId: vote.engineId, up: 0, down: 0 };
    if (vote.vote === "up") entry.up += 1;
    else entry.down += 1;
    byEngine.set(vote.engineId, entry);
  }
  return [...byEngine.values()].sort(
    (a, b) => b.up - b.down - (a.up - a.down) || b.up + b.down - (a.up + a.down)
  );
}
