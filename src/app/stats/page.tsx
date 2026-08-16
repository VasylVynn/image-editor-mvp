"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ENGINES } from "@/lib/engines";

interface VoteSummary {
  engineId: string;
  up: number;
  down: number;
}

function engineLabel(engineId: string): string {
  return ENGINES.find((e) => e.id === engineId)?.label ?? engineId;
}

export default function StatsPage() {
  const [summary, setSummary] = useState<VoteSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/votes")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Не вдалося завантажити");
        setSummary(body.summary);
        setTotal(body.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Помилка"));
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Рейтинг моделей</h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← До редактора
          </Link>
        </div>
        <p className="text-sm text-gray-600">
          Голоси 👍/👎 під результатами. Всього голосів: {total}.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}
        {!summary && !error && <p className="text-gray-500">Завантаження…</p>}

        {summary && summary.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-500">
            Ще нема голосів — оцінюйте результати на головній сторінці.
          </div>
        )}

        {summary && summary.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Модель</th>
                  <th className="text-right px-4 py-2">👍</th>
                  <th className="text-right px-4 py-2">👎</th>
                  <th className="text-right px-4 py-2">Рахунок</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.engineId} className="border-t border-gray-100 text-gray-900">
                    <td className="px-4 py-2">{engineLabel(row.engineId)}</td>
                    <td className="px-4 py-2 text-right text-green-700">{row.up}</td>
                    <td className="px-4 py-2 text-right text-red-600">{row.down}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {row.up - row.down > 0 ? "+" : ""}
                      {row.up - row.down}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
