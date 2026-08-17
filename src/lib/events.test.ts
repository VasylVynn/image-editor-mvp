import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { appendEvent, loadEvents, computeAnalytics, type AppEvent } from "./events";

let eventsPath: string;
beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "events-test-"));
  eventsPath = path.join(dir, "events.jsonl");
});

const PRICES = { gemini: 0.1, cheap: 0.04 };

function gen(engineId: string, ok: boolean, ts: string, durationMs = 10_000): AppEvent {
  return { type: "generation", timestamp: ts, engineId, presetId: "default", mode: "file", durationMs, ok };
}
function save(engineId: string | undefined, ts: string): AppEvent {
  return { type: "save", timestamp: ts, engineId, presetId: "default" };
}

describe("events storage", () => {
  it("appends and loads events", async () => {
    await appendEvent(
      { type: "generation", engineId: "gemini", presetId: "default", mode: "url", durationMs: 12, ok: true },
      eventsPath
    );
    await appendEvent({ type: "save", presetId: "default", engineId: "gemini" }, eventsPath);
    const events = await loadEvents(eventsPath);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("generation");
    expect(events[1].type).toBe("save");
    expect(events[0].timestamp).toBeTruthy();
  });

  it("returns empty list when no file", async () => {
    expect(await loadEvents(eventsPath)).toEqual([]);
  });
});

describe("computeAnalytics", () => {
  const events: AppEvent[] = [
    gen("gemini", true, "2026-08-15T10:00:00Z", 20_000),
    gen("gemini", true, "2026-08-15T11:00:00Z", 10_000),
    save("gemini", "2026-08-15T11:01:00Z"),
    gen("cheap", true, "2026-08-16T09:00:00Z"),
    gen("cheap", false, "2026-08-16T09:05:00Z"),
    save("cheap", "2026-08-16T09:10:00Z"),
  ];

  it("tallies totals, cost (failures unbilled) and save rate", () => {
    const a = computeAnalytics(events, PRICES);
    expect(a.totals.generations).toBe(4);
    expect(a.totals.failures).toBe(1);
    expect(a.totals.saves).toBe(2);
    expect(a.totals.costUsd).toBeCloseTo(0.24); // 2×0.1 + 1×0.04
    expect(a.totals.saveRate).toBeCloseTo(2 / 3, 2);
  });

  it("computes per-engine cost of a saved photo and avg duration", () => {
    const a = computeAnalytics(events, PRICES);
    const gemini = a.perEngine.find((e) => e.engineId === "gemini")!;
    expect(gemini.costPerSaveUsd).toBeCloseTo(0.2); // 2 generations per 1 save
    expect(gemini.avgDurationMs).toBe(15_000);
    const cheap = a.perEngine.find((e) => e.engineId === "cheap")!;
    expect(cheap.failures).toBe(1);
  });

  it("groups per day (newest first) and honors the since filter", () => {
    const a = computeAnalytics(events, PRICES);
    expect(a.perDay.map((d) => d.date)).toEqual(["2026-08-16", "2026-08-15"]);
    const recent = computeAnalytics(events, PRICES, Date.parse("2026-08-16T00:00:00Z"));
    expect(recent.totals.generations).toBe(2);
    expect(recent.perDay).toHaveLength(1);
  });
});
