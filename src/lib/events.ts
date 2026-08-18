import fs from "fs/promises";
import path from "path";

// Append-only analytics log (data/events.jsonl, gitignored): one line per
// generation attempt and per saved file. Everything else is derived from it.

export interface GenerationEvent {
  type: "generation";
  timestamp: string;
  engineId: string;
  presetId: string;
  mode: "file" | "url";
  durationMs: number;
  ok: boolean;
  /** Operator-facing error class (the mapped Ukrainian message) when !ok. */
  errorClass?: string;
  upscaled?: boolean;
  /** Which path produced the result. "deterministic" = local sharp compose,
   *  no model call (engineId is "deterministic", cost 0). */
  pipeline?: "deterministic" | "generative";
  /** Operator's regenerate note — the failure label for the previous attempt.
   *  This is the raw material for the future QA golden set. */
  note?: string;
  /** Client-generated id grouping all attempts on one product photo. */
  sessionId?: string;
  /** 1-based attempt number within the session. */
  attempt?: number;
}

export interface SaveEvent {
  type: "save";
  timestamp: string;
  engineId?: string;
  presetId: string;
  file?: string;
  /** Which path produced the saved image. */
  pipeline?: "deterministic" | "generative";
  /** Links the save to its generation attempts (see GenerationEvent). */
  sessionId?: string;
}

export type AppEvent = GenerationEvent | SaveEvent;

export interface EngineAnalytics {
  engineId: string;
  generations: number;
  failures: number;
  saves: number;
  avgDurationMs: number;
  costUsd: number;
  /** Cost of one SAVED photo — regenerations included. */
  costPerSaveUsd: number | null;
}

export interface DayAnalytics {
  date: string; // YYYY-MM-DD
  generations: number;
  saves: number;
  costUsd: number;
}

export interface Analytics {
  totals: {
    generations: number;
    failures: number;
    saves: number;
    costUsd: number;
    /** saves / successful generations */
    saveRate: number | null;
  };
  perEngine: EngineAnalytics[];
  perDay: DayAnalytics[];
}

const EVENTS_PATH = path.join(process.cwd(), "data", "events.jsonl");

export async function appendEvent(
  event: Omit<GenerationEvent, "timestamp"> | Omit<SaveEvent, "timestamp">,
  eventsPath: string = EVENTS_PATH
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(eventsPath), { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...event });
    await fs.appendFile(eventsPath, line + "\n");
  } catch (err) {
    // Analytics must never break the actual workflow.
    console.warn("appendEvent failed:", err);
  }
}

export async function loadEvents(eventsPath: string = EVENTS_PATH): Promise<AppEvent[]> {
  try {
    const raw = await fs.readFile(eventsPath, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as AppEvent);
  } catch {
    return [];
  }
}

export function computeAnalytics(
  events: AppEvent[],
  priceUsdByEngine: Record<string, number>,
  sinceMs?: number
): Analytics {
  const relevant = sinceMs
    ? events.filter((e) => Date.parse(e.timestamp) >= sinceMs)
    : events;

  const perEngine = new Map<string, EngineAnalytics & { durationSum: number }>();
  const perDay = new Map<string, DayAnalytics>();
  const engineOf = (id: string) => {
    const entry =
      perEngine.get(id) ??
      ({
        engineId: id,
        generations: 0,
        failures: 0,
        saves: 0,
        avgDurationMs: 0,
        costUsd: 0,
        costPerSaveUsd: null,
        durationSum: 0,
      } as EngineAnalytics & { durationSum: number });
    perEngine.set(id, entry);
    return entry;
  };
  const dayOf = (timestamp: string) => {
    const date = timestamp.slice(0, 10);
    const entry = perDay.get(date) ?? { date, generations: 0, saves: 0, costUsd: 0 };
    perDay.set(date, entry);
    return entry;
  };

  let generations = 0;
  let failures = 0;
  let saves = 0;
  let costUsd = 0;

  for (const event of relevant) {
    if (event.type === "generation") {
      const engine = engineOf(event.engineId);
      const day = dayOf(event.timestamp);
      const cost = priceUsdByEngine[event.engineId] ?? 0;
      generations += 1;
      engine.generations += 1;
      engine.durationSum += event.durationMs;
      day.generations += 1;
      if (event.ok) {
        // Failed calls are normally not billed by providers.
        engine.costUsd += cost;
        day.costUsd += cost;
        costUsd += cost;
      } else {
        failures += 1;
        engine.failures += 1;
      }
    } else if (event.type === "save") {
      saves += 1;
      dayOf(event.timestamp).saves += 1;
      if (event.engineId) engineOf(event.engineId).saves += 1;
    }
  }

  const engines = [...perEngine.values()]
    .map(({ durationSum, ...engine }) => ({
      ...engine,
      avgDurationMs: engine.generations ? Math.round(durationSum / engine.generations) : 0,
      costUsd: Math.round(engine.costUsd * 1000) / 1000,
      costPerSaveUsd: engine.saves
        ? Math.round((engine.costUsd / engine.saves) * 1000) / 1000
        : null,
    }))
    .sort((a, b) => b.generations - a.generations);

  const successful = generations - failures;
  return {
    totals: {
      generations,
      failures,
      saves,
      costUsd: Math.round(costUsd * 1000) / 1000,
      saveRate: successful > 0 ? Math.round((saves / successful) * 100) / 100 : null,
    },
    perEngine: engines,
    perDay: [...perDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}
