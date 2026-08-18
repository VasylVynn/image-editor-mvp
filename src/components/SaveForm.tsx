"use client";

import { useEffect, useState } from "react";
import { UPSCALERS } from "@/lib/upscalers";

export interface SaveFormProps {
  resultImage: string;
  promptUsed: string;
  presetId: string;
  defaultSku: string;
  defaultProductName: string;
  /** Engine that generated the result — analytics attribution. */
  model?: string;
  /** Which path produced the result ("deterministic" | "generative"). */
  pipeline?: string;
  /** Links the save to its generation attempts in the events log. */
  sessionId?: string;
  onSaved: (path: string) => void;
}

export default function SaveForm({
  resultImage,
  promptUsed,
  presetId,
  defaultSku,
  defaultProductName,
  model,
  pipeline,
  sessionId,
  onSaved,
}: SaveFormProps) {
  const [sku, setSku] = useState(defaultSku);
  const [productName, setProductName] = useState(defaultProductName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upscale, setUpscale] = useState(false);
  const [upscalerId, setUpscalerId] = useState(UPSCALERS[0].id);
  const [warning, setWarning] = useState<string | null>(null);

  // A new result resets the fields back to their defaults.
  useEffect(() => {
    setSku(defaultSku);
    setProductName(defaultProductName);
    setError(null);
    setUpscale(false);
    setWarning(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultImage]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setWarning(null);

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
          pipeline,
          sessionId,
          upscale,
          upscalerId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Помилка збереження");
      }

      if (data.upscaleFailed) {
        setWarning("Збережено без апскейлу — апскейлер не відповів");
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

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={upscale}
          onChange={(e) => setUpscale(e.target.checked)}
          disabled={saving}
        />
        Апскейлити перед збереженням
      </label>
      {upscale && (
        <select
          value={upscalerId}
          onChange={(e) => setUpscalerId(e.target.value)}
          disabled={saving}
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white text-gray-900"
        >
          {UPSCALERS.map((upscaler) => (
            <option key={upscaler.id} value={upscaler.id}>
              {upscaler.label} ({upscaler.price})
            </option>
          ))}
        </select>
      )}

      {warning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm text-center">
          {warning}
        </div>
      )}

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
