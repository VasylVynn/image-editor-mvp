"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ALLOWED_ASPECT_RATIOS,
  DEFAULT_PRESET_PROMPT,
  validatePresets,
  type Preset,
} from "@/lib/preset-schema";
import { slugify } from "@/lib/naming";

const NEW_PRESET: Omit<Preset, "id"> = {
  name: "",
  width: 940,
  height: 1300,
  background: "#E9E9E9",
  aspectRatio: "3:4",
  outputDir: "~/CatalogPhotos/",
  prompt: DEFAULT_PRESET_PROMPT,
};

function ensureIds(presets: Preset[]): Preset[] {
  const taken = new Set(presets.map((p) => p.id).filter(Boolean));
  return presets.map((preset) => {
    if (preset.id) return preset;
    const base = slugify(preset.name) || "preset";
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    taken.add(id);
    return { ...preset, id };
  });
}

export default function PresetsPage() {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    fetch("/api/presets")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Не вдалося завантажити пресети");
        setPresets(body.presets);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Помилка завантаження"));
  }, []);

  const updateField = (index: number, patch: Partial<Preset>) => {
    setPresets((prev) =>
      prev ? prev.map((p, i) => (i === index ? { ...p, ...patch } : p)) : prev
    );
    setSavedOk(false);
  };

  const addPreset = () => {
    setPresets((prev) => (prev ? [...prev, { id: "", ...NEW_PRESET }] : prev));
    setSavedOk(false);
  };

  const removePreset = (index: number) => {
    setPresets((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
    setSavedOk(false);
  };

  const handleSave = async () => {
    if (!presets) return;
    const withIds = ensureIds(presets);
    const errors = validatePresets(withIds);
    if (errors.length > 0) {
      setError(errors.join("\n"));
      return;
    }
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const res = await fetch("/api/presets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presets: withIds }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Не вдалося зберегти");
      setPresets(body.presets);
      setSavedOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Пресети магазинів</h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← До редактора
          </Link>
        </div>
        <p className="text-sm text-gray-600">
          Пресет — це налаштування одного магазину: розмір фото, колір фону та папка,
          куди зберігаються готові файли.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm whitespace-pre-line">
            {error}
          </div>
        )}
        {savedOk && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">
            Збережено
          </div>
        )}

        {!presets && !error && <p className="text-gray-500">Завантаження…</p>}

        {presets && (
          <div className="space-y-4">
            {presets.map((preset, index) => (
              <div
                key={index}
                className="bg-white rounded-lg border border-gray-200 p-4 space-y-3"
              >
                <div className="flex items-end gap-3 flex-wrap">
                  <label className="flex-1 min-w-[220px] text-sm text-gray-700">
                    Назва магазину
                    <input
                      type="text"
                      value={preset.name}
                      onChange={(e) => updateField(index, { name: e.target.value })}
                      placeholder="напр. Kidsy Shop"
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white text-gray-900 placeholder-gray-400"
                    />
                  </label>
                  <button
                    onClick={() => removePreset(index)}
                    disabled={presets.length === 1}
                    className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Видалити
                  </button>
                </div>

                <div className="flex items-end gap-3 flex-wrap">
                  <label className="text-sm text-gray-700">
                    Ширина, px
                    <input
                      type="number"
                      min={1}
                      value={preset.width}
                      onChange={(e) => updateField(index, { width: Number(e.target.value) })}
                      className="mt-1 w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white text-gray-900"
                    />
                  </label>
                  <label className="text-sm text-gray-700">
                    Висота, px
                    <input
                      type="number"
                      min={1}
                      value={preset.height}
                      onChange={(e) => updateField(index, { height: Number(e.target.value) })}
                      className="mt-1 w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white text-gray-900"
                    />
                  </label>
                  <label className="text-sm text-gray-700">
                    Пропорції
                    <select
                      value={preset.aspectRatio}
                      onChange={(e) => updateField(index, { aspectRatio: e.target.value })}
                      className="mt-1 block border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white text-gray-900"
                    >
                      {ALLOWED_ASPECT_RATIOS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-gray-700">
                    Фон
                    <span className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(preset.background) ? preset.background : "#E9E9E9"}
                        onChange={(e) => updateField(index, { background: e.target.value.toUpperCase() })}
                        className="h-8 w-10 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={preset.background}
                        onChange={(e) => updateField(index, { background: e.target.value })}
                        className="w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white text-gray-900"
                      />
                    </span>
                  </label>
                </div>

                <label className="block text-sm text-gray-700">
                  Папка збереження
                  <input
                    type="text"
                    value={preset.outputDir}
                    onChange={(e) => updateField(index, { outputDir: e.target.value })}
                    placeholder="~/CatalogPhotos/kidsy"
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white text-gray-900 placeholder-gray-400"
                  />
                </label>

                <label className="block text-sm text-gray-700">
                  <span className="flex items-center justify-between">
                    Інструкція обробки (промпт для моделі)
                    {preset.prompt !== DEFAULT_PRESET_PROMPT && (
                      <button
                        type="button"
                        onClick={() => updateField(index, { prompt: DEFAULT_PRESET_PROMPT })}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Повернути стандартну
                      </button>
                    )}
                  </span>
                  <textarea
                    value={preset.prompt}
                    onChange={(e) => updateField(index, { prompt: e.target.value })}
                    rows={7}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 placeholder-gray-400 font-mono leading-snug"
                  />
                  <span className="block mt-1 text-xs text-gray-500">
                    Розмір, фон і центрування додаються автоматично з полів вище — тут лише правила обробки товару.
                  </span>
                </label>
              </div>
            ))}

            <div className="flex gap-3">
              <button
                onClick={addPreset}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                + Додати пресет
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Зберігаємо…" : "Зберегти"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
