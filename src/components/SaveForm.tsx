"use client";

import { useEffect, useState } from "react";

export interface SaveFormProps {
  resultImage: string;
  promptUsed: string;
  presetId: string;
  defaultSku: string;
  defaultProductName: string;
  /** Engine that generated the result — analytics attribution. */
  model?: string;
  onSaved: (path: string) => void;
}

export default function SaveForm({
  resultImage,
  promptUsed,
  presetId,
  defaultSku,
  defaultProductName,
  model,
  onSaved,
}: SaveFormProps) {
  const [sku, setSku] = useState(defaultSku);
  const [productName, setProductName] = useState(defaultProductName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new result resets the fields back to their defaults.
  useEffect(() => {
    setSku(defaultSku);
    setProductName(defaultProductName);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultImage]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: resultImage,
          sku,
          productName,
          presetId,
          promptUsed,
          model,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Помилка збереження");
      }

      onSaved(data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Щось пішло не так");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 w-full max-w-md">
      <label className="block text-sm text-gray-700">
        Артикул (SKU)
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          disabled={saving}
          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white text-gray-900"
        />
      </label>
      <label className="block text-sm text-gray-700">
        Назва товару
        <input
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          disabled={saving}
          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white text-gray-900"
        />
      </label>
      <p className="text-xs text-gray-500">Ім&apos;я файлу = артикул, якщо вказано</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm text-center">
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {saving ? "Зберігаємо…" : "Зберегти у папку"}
      </button>
    </div>
  );
}
