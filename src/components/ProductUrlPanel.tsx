"use client";

import { useState } from "react";

export interface ProductUrlPanelProps {
  onProductLoaded: (product: {
    title: string | null;
    sku: string | null;
    images: string[];
  }) => void;
  disabled: boolean;
}

export default function ProductUrlPanel({ onProductLoaded, disabled }: ProductUrlPanelProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/fetch-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Не вдалося прочитати сторінку");
      }

      onProductLoaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Щось пішло не так");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <label className="block text-sm text-gray-700">
        Посилання на товар
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleFetch();
              }
            }}
            disabled={disabled || loading}
            placeholder="https://shop.ua/p/тovar"
            className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={handleFetch}
            disabled={disabled || loading || !url.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? "Шукаємо…" : "Знайти фото"}
          </button>
        </div>
      </label>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm text-center">
          {error}
        </div>
      )}
    </div>
  );
}
