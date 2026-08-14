"use client";

import { useCallback, useState } from "react";
import UploadPanel from "@/components/UploadPanel";
import ProcessingStatus from "@/components/ProcessingStatus";
import presetsConfig from "@/config/presets.json";

type Stage = "idle" | "processing" | "done";

interface ProcessResult {
  image: string;
  promptUsed: string;
  analysis: string | null;
  analysisFailed: boolean;
}

export default function Home() {
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [presetId, setPresetId] = useState("default");
  const [analyze, setAnalyze] = useState(true);
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImagesChange = useCallback((main: File | null, reference: File | null) => {
    setMainFile(main);
    setRefFile(reference);
  }, []);

  const handleProcess = useCallback(async () => {
    if (!mainFile) return;

    setStage("processing");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", mainFile);
      if (refFile) formData.append("reference", refFile);
      formData.append("note", note);
      formData.append("presetId", presetId);
      formData.append("analyze", String(analyze));

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Помилка обробки");
      }

      setResult(data);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Щось пішло не так");
      setStage("idle");
    }
  }, [mainFile, refFile, note, presetId, analyze]);

  const handleReset = useCallback(() => {
    setMainFile(null);
    setRefFile(null);
    setNote("");
    setPresetId("default");
    setAnalyze(true);
    setStage("idle");
    setResult(null);
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">
            Каталог: обробка фото товарів
          </h1>
          <p className="text-gray-600 mt-2">
            Завантажте фото товару — отримайте каталожне зображення на єдиному фоні
          </p>
        </div>

        <div className="space-y-6">
          {/* Upload */}
          <UploadPanel onImagesChange={handleImagesChange} disabled={stage === "processing"} />

          {/* Controls */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Пресет
              <select
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
                disabled={stage === "processing"}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm"
              >
                {presetsConfig.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={analyze}
                onChange={(e) => setAnalyze(e.target.checked)}
                disabled={stage === "processing"}
              />
              Аналіз деталей
            </label>

            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={stage === "processing"}
              placeholder="Примітка (необовʼязково): напр. прибери вішак"
              className="flex-1 min-w-[240px] border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-center space-y-2">
              <p>{error}</p>
              <button
                onClick={handleProcess}
                className="px-4 py-2 bg-white border border-red-300 rounded-lg text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Спробувати ще
              </button>
            </div>
          )}

          {/* Processing */}
          {stage === "processing" && (
            <div className="flex items-center justify-center border border-gray-200 rounded-xl bg-white min-h-[200px]">
              <ProcessingStatus />
            </div>
          )}

          {/* Result (temporary raw preview; CompareView replaces this) */}
          {result && (
            <div className="space-y-3">
              {result.analysisFailed && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm text-center">
                  Аналіз не спрацював, використано базовий промпт
                </div>
              )}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.image}
                  alt="Результат"
                  className="max-w-full max-h-[500px] object-contain mx-auto"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-center gap-4">
            {mainFile && (
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Нове фото
              </button>
            )}

            {mainFile && stage !== "processing" && !result && (
              <button
                onClick={handleProcess}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Обробити
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
