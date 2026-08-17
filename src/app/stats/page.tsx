"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ENGINES } from "@/lib/engines";

interface EngineRow {
  engineId: string;
  generations: number;
  failures: number;
  saves: number;
  avgDurationMs: number;
  costUsd: number;
  costPerSaveUsd: number | null;
}

interface DayRow {
  date: string;
  generations: number;
  saves: number;
  costUsd: number;
}

interface VoteRow {
  engineId: string;
  up: number;
  down: number;
}

interface AnalyticsResponse {
  totals: {
    generations: number;
    failures: number;
    saves: number;
    costUsd: number;
    saveRate: number | null;
  };
  perEngine: EngineRow[];
  perDay: DayRow[];
  votes: VoteRow[];
}

const PERIODS = [
  { label: "Сьогодні", days: 1 },
  { label: "7 днів", days: 7 },
  { label: "30 днів", days: 30 },
  { label: "Весь час", days: 0 },
];

function engineLabel(engineId: string): string {
  return ENGINES.find((e) => e.id === engineId)?.label ?? engineId;
}

function enginePrice(engineId: string): string {
  const engine = ENGINES.find((e) => e.id === engineId);
  return engine ? `$${engine.priceUsd.toFixed(3)}` : "—";
}

function usd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export default function StatsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectPeriod = (value: number) => {
    setDays(value);
    setData(null);
    setError(null);
  };

  useEffect(() => {
    fetch(`/api/analytics${days ? `?days=${days}` : ""}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Не вдалося завантажити");
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Помилка"));
  }, [days]);

  const voteFor = (engineId: string) => data?.votes.find((v) => v.engineId === engineId);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Аналітика</h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← До редактора
          </Link>
        </div>

        <div className="flex gap-2">
          {PERIODS.map((period) => (
            <button
              key={period.days}
              onClick={() => selectPeriod(period.days)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                days === period.days
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}
        {!data && !error && <p className="text-gray-500">Завантаження…</p>}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Генерацій", value: String(data.totals.generations) },
                { label: "Збережено", value: String(data.totals.saves) },
                { label: "Витрачено", value: usd(data.totals.costUsd) },
                {
                  label: "Конверсія в сейв",
                  value:
                    data.totals.saveRate !== null
                      ? `${Math.round(data.totals.saveRate * 100)}%`
                      : "—",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="bg-white border border-gray-200 rounded-lg p-4 text-center"
                >
                  <div className="text-2xl font-bold text-gray-900">{card.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{card.label}</div>
                </div>
              ))}
            </div>
            {data.totals.failures > 0 && (
              <p className="text-sm text-red-600">
                Помилок генерації: {data.totals.failures}
              </p>
            )}

            {/* Per-engine table */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">Модель</th>
                    <th className="text-right px-3 py-2">Ціна/ген</th>
                    <th className="text-right px-3 py-2">Ген.</th>
                    <th className="text-right px-3 py-2">Помилок</th>
                    <th className="text-right px-3 py-2">Сейвів</th>
                    <th className="text-right px-3 py-2">Сер. час</th>
                    <th className="text-right px-3 py-2">$ всього</th>
                    <th className="text-right px-3 py-2">$/сейв</th>
                    <th className="text-right px-3 py-2">👍/👎</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perEngine.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                        Ще нема даних за період — обробіть кілька фото.
                      </td>
                    </tr>
                  )}
                  {data.perEngine.map((row) => {
                    const vote = voteFor(row.engineId);
                    return (
                      <tr key={row.engineId} className="border-t border-gray-100 text-gray-900">
                        <td className="px-3 py-2">{engineLabel(row.engineId)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {enginePrice(row.engineId)}
                        </td>
                        <td className="px-3 py-2 text-right">{row.generations}</td>
                        <td className="px-3 py-2 text-right text-red-600">
                          {row.failures || ""}
                        </td>
                        <td className="px-3 py-2 text-right">{row.saves}</td>
                        <td className="px-3 py-2 text-right">
                          {Math.round(row.avgDurationMs / 1000)}с
                        </td>
                        <td className="px-3 py-2 text-right">{usd(row.costUsd)}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {row.costPerSaveUsd !== null ? usd(row.costPerSaveUsd) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <span className="text-green-700">{vote?.up ?? 0}</span>
                          {" / "}
                          <span className="text-red-600">{vote?.down ?? 0}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 -mt-3">
              $/сейв — реальна ціна одного збереженого фото з урахуванням перегенерацій.
            </p>

            {/* Per-day */}
            {data.perDay.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2">День</th>
                      <th className="text-right px-3 py-2">Генерацій</th>
                      <th className="text-right px-3 py-2">Збережено</th>
                      <th className="text-right px-3 py-2">Витрачено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perDay.slice(0, 14).map((day) => (
                      <tr key={day.date} className="border-t border-gray-100 text-gray-900">
                        <td className="px-3 py-2">{day.date}</td>
                        <td className="px-3 py-2 text-right">{day.generations}</td>
                        <td className="px-3 py-2 text-right">{day.saves}</td>
                        <td className="px-3 py-2 text-right">{usd(day.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
