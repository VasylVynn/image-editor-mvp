"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import UploadPanel from "@/components/UploadPanel";
import ProcessingStatus from "@/components/ProcessingStatus";
import CompareView from "@/components/CompareView";
import SaveForm from "@/components/SaveForm";
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
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Cancel any in-flight request on unmount so it can't resolve into a stale UI.
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  // Keep object URLs for the compare view in sync with the selected files.
  useEffect(() => {
    if (!mainFile) {
      setOriginalUrl(null);
      return;
    }
    const url = URL.createObjectURL(mainFile);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mainFile]);

  useEffect(() => {
    if (!refFile) {
      setReferenceUrl(null);
      return;
    }
    const url = URL.createObjectURL(refFile);
    setReferenceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [refFile]);

  const handleImagesChange = useCallback((main: File | null, reference: File | null) => {
    setMainFile(main);
    setRefFile(reference);
  }, []);

  const handleProcess = useCallback(async () => {
    if (!mainFile) return;

    // Cancel any request still in flight (e.g. a fast regenerate click) before starting a new one.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStage("processing");
    setError(null);
    setSavedPath(null);

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
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Помилка обробки");
      }

      setResult(data);
      setStage("done");
    } catch (err) {
      // Aborted deliberately (reset/unmount) — the UI has already moved on, don't clobber it.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Щось пішло не так");
      setStage("idle");
    }
  }, [mainFile, refFile, note, presetId, analyze]);

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort();
    setMainFile(null);
    setRefFile(null);
    setNote("");
    setPresetId("default");
    setAnalyze(true);
    setStage("idle");
    setResult(null);
    setError(null);
    setSavedPath(null);
  }, []);

  const defaultProductName = mainFile ? mainFile.name.replace(/\.[^.]+$/, "") : "";

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
          <UploadPanel onImagesChange={handleImagesChange} disabled={stage !== "idle"} />

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

          {/* Result: compare view + save/regenerate actions */}
          {stage === "done" && result && originalUrl && (
            <div className="space-y-4">
              {result.analysisFailed && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm text-center">
                  Аналіз не спрацював, використано базовий промпт
                </div>
              )}

              <CompareView
                originalUrl={originalUrl}
                referenceUrl={referenceUrl}
                resultImage={result.image}
              />

              <div className="flex flex-col items-center gap-4">
                {savedPath && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm text-center w-full max-w-md">
                    Збережено: {savedPath}
                  </div>
                )}

                <SaveForm
                  resultImage={result.image}
                  promptUsed={result.promptUsed}
                  presetId={presetId}
                  defaultSku=""
                  defaultProductName={defaultProductName}
                  onSaved={setSavedPath}
                />

                <div className="flex gap-4">
                  <button
                    onClick={handleProcess}
                    className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Перегенерувати
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Нове фото
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Idle actions */}
          {stage !== "done" && (
            <div className="flex justify-center gap-4">
              {mainFile && stage !== "processing" && (
                <button
                  onClick={handleReset}
                  className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Нове фото
                </button>
              )}

              {mainFile && stage !== "processing" && (
                <button
                  onClick={handleProcess}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Обробити
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
