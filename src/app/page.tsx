"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import UploadPanel from "@/components/UploadPanel";
import ProductUrlPanel from "@/components/ProductUrlPanel";
import ProcessingStatus from "@/components/ProcessingStatus";
import CompareView from "@/components/CompareView";
import SaveForm from "@/components/SaveForm";
import Link from "next/link";
import type { Preset } from "@/lib/preset-schema";
import { ENGINES } from "@/lib/engines";

type Stage = "idle" | "processing" | "done";
type Mode = "file" | "url";

interface ProcessResult {
  image: string;
  promptUsed: string;
  analysis: string | null;
  analysisFailed: boolean;
}

interface ProductInfo {
  title: string | null;
  sku: string | null;
  images: string[];
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("file");

  const [mainFile, setMainFile] = useState<File | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);

  // URL-mode: product page fetch + gallery selection.
  const [productTitle, setProductTitle] = useState<string | null>(null);
  const [productSku, setProductSku] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [mainUrl, setMainUrl] = useState<string | null>(null);
  const [refUrl, setRefUrl] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState("default");
  const [engineId, setEngineId] = useState("gemini");
  const [analyze, setAnalyze] = useState(true);
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const [fileOriginalUrl, setFileOriginalUrl] = useState<string | null>(null);
  const [fileReferenceUrl, setFileReferenceUrl] = useState<string | null>(null);

  // Bumped on reset to force UploadPanel/ProductUrlPanel to remount, clearing
  // their internal state (file/thumbnail selection, URL text, in-flight
  // fetch) that isn't otherwise controlled by the page. This also aborts any
  // fetch-product request still in flight when a remount tears it down,
  // preventing a stale response from repopulating cleared state.
  const [uploadKey, setUploadKey] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Mirrors `result` so async callbacks (the catch below, cancel) can read the
  // CURRENT value instead of the one captured in their closure — a failed
  // regenerate must fall back to whatever result is actually on screen right
  // now, not whatever was there when the request started.
  const resultRef = useRef<ProcessResult | null>(null);
  const updateResult = useCallback((value: ProcessResult | null) => {
    resultRef.current = value;
    setResult(value);
  }, []);

  // Cancel any in-flight request on unmount so it can't resolve into a stale UI.
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  // Presets are editable at runtime (/presets page), so load them via the API
  // instead of a build-time import. Falls back to keeping the current id if
  // it still exists, else the first preset.
  useEffect(() => {
    fetch("/api/presets")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Не вдалося завантажити пресети");
        const loaded: Preset[] = body.presets;
        setPresets(loaded);
        setPresetId((current) =>
          loaded.some((p) => p.id === current) ? current : loaded[0]?.id ?? current
        );
      })
      .catch(() => {
        // Non-fatal: the select stays empty; processing still works with the
        // server-side default preset id.
      });
  }, []);

  // Keep object URLs for the compare view in sync with the selected files.
  useEffect(() => {
    if (!mainFile) {
      setFileOriginalUrl(null);
      return;
    }
    const url = URL.createObjectURL(mainFile);
    setFileOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mainFile]);

  useEffect(() => {
    if (!refFile) {
      setFileReferenceUrl(null);
      return;
    }
    const url = URL.createObjectURL(refFile);
    setFileReferenceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [refFile]);

  // URL mode uses the remote URLs directly — no object URL lifecycle needed.
  const originalUrl = mode === "file" ? fileOriginalUrl : mainUrl;
  const referenceUrl = mode === "file" ? fileReferenceUrl : refUrl;

  const handleImagesChange = useCallback((main: File | null, reference: File | null) => {
    setMainFile(main);
    setRefFile(reference);
  }, []);

  const handleProductLoaded = useCallback((product: ProductInfo) => {
    setProductTitle(product.title);
    setProductSku(product.sku);
    setGalleryImages(product.images);
    setMainUrl(null);
    setRefUrl(null);
  }, []);

  // Cycle a gallery thumbnail: none -> Основне -> Референс -> none.
  // Only one image can hold each role; picking a new Основне clears the previous one.
  const cycleThumbnail = useCallback(
    (img: string) => {
      if (mainUrl === img) {
        setMainUrl(null);
        setRefUrl(img);
      } else if (refUrl === img) {
        setRefUrl(null);
      } else {
        setMainUrl(img);
      }
    },
    [mainUrl, refUrl]
  );

  const hasMainImage = mode === "file" ? !!mainFile : !!mainUrl;

  const handleProcess = useCallback(async () => {
    const hasMain = mode === "file" ? !!mainFile : !!mainUrl;
    if (!hasMain) return;

    // Cancel any request still in flight (e.g. a fast regenerate click) before starting a new one.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStage("processing");
    setError(null);
    setSavedPath(null);

    try {
      const formData = new FormData();
      if (mode === "file") {
        formData.append("image", mainFile as File);
        if (refFile) formData.append("reference", refFile);
      } else {
        formData.append("imageUrl", mainUrl as string);
        if (refUrl) formData.append("referenceUrl", refUrl);
      }
      formData.append("note", note);
      formData.append("presetId", presetId);
      formData.append("analyze", String(analyze));
      formData.append("model", engineId);

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Помилка обробки");
      }

      updateResult(data);
      setStage("done");
    } catch (err) {
      // Aborted deliberately (reset/unmount/cancel) — the abort site (handleCancel,
      // handleReset) or the superseding request already owns the stage transition,
      // so this stale rejection must not clobber it.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Щось пішло не так");
      // Keep showing the last successful result (if any) instead of hiding it —
      // a failed regenerate shouldn't throw away an already-paid-for image.
      setStage(resultRef.current ? "done" : "idle");
    }
  }, [mode, mainFile, refFile, mainUrl, refUrl, note, presetId, analyze, engineId, updateResult]);

  // Cancels an in-flight request and returns to a sane state. The fetch's own
  // AbortError branch above is a no-op, so this is the sole place that decides
  // the post-cancel stage — no race with the aborted request's rejection.
  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setStage(resultRef.current ? "done" : "idle");
  }, []);

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort();
    setMainFile(null);
    setRefFile(null);
    setProductTitle(null);
    setProductSku(null);
    setGalleryImages([]);
    setMainUrl(null);
    setRefUrl(null);
    setNote("");
    setPresetId("default");
    setAnalyze(true);
    setStage("idle");
    updateResult(null);
    setError(null);
    setSavedPath(null);
    setUploadKey((k) => k + 1);
  }, [updateResult]);

  const defaultProductName =
    mode === "url"
      ? productTitle ?? ""
      : mainFile
        ? mainFile.name.replace(/\.[^.]+$/, "")
        : "";
  const defaultSku = mode === "url" ? productSku ?? "" : "";

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
          {/* Source mode switch */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setMode("file")}
              disabled={stage !== "idle"}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors disabled:opacity-50 ${
                mode === "file"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Завантажити файли
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              disabled={stage !== "idle"}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors disabled:opacity-50 ${
                mode === "url"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              З посилання
            </button>
          </div>

          {/* Upload */}
          {mode === "file" ? (
            <UploadPanel key={uploadKey} onImagesChange={handleImagesChange} disabled={stage !== "idle"} />
          ) : (
            <div className="space-y-4">
              <ProductUrlPanel
                key={uploadKey}
                onProductLoaded={handleProductLoaded}
                disabled={stage !== "idle"}
              />

              {productTitle && (
                <p className="text-sm text-gray-600">Товар: {productTitle}</p>
              )}

              {galleryImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {galleryImages.map((img) => {
                    const badge = mainUrl === img ? "main" : refUrl === img ? "ref" : null;
                    return (
                      <button
                        type="button"
                        key={img}
                        onClick={() => cycleThumbnail(img)}
                        disabled={stage !== "idle"}
                        className="relative border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm disabled:opacity-50"
                      >
                        {badge && (
                          <span
                            className={`absolute top-2 left-2 px-2 py-1 rounded-md text-xs font-medium ${
                              badge === "main"
                                ? "bg-blue-600 text-white"
                                : "bg-white/90 text-gray-700"
                            }`}
                          >
                            {badge === "main" ? "Основне" : "Референс"}
                          </span>
                        )}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt="" className="w-full h-32 object-contain bg-gray-50" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Пресет
              <select
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
                disabled={stage === "processing"}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-gray-900"
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>

            <Link
              href="/presets"
              className="text-sm text-blue-600 hover:underline whitespace-nowrap"
            >
              ⚙ Пресети
            </Link>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              Модель
              <select
                value={engineId}
                onChange={(e) => setEngineId(e.target.value)}
                disabled={stage === "processing"}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-gray-900"
              >
                {ENGINES.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.label} — {engine.price}
                  </option>
                ))}
              </select>
            </label>

            <p className="w-full text-xs text-gray-500 -mt-2">
              {ENGINES.find((e) => e.id === engineId)?.description}{" "}
              Ціна — за одну генерацію.
            </p>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={analyze}
                onChange={(e) => setAnalyze(e.target.checked)}
                disabled={stage === "processing"}
              />
              Аналіз деталей
            </label>

            {stage !== "done" && (
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={stage === "processing"}
                placeholder="Примітка для моделі (необовʼязково): напр. прибери вішак"
                className="flex-1 min-w-[240px] border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white text-gray-900 placeholder-gray-400"
              />
            )}
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
            <div className="flex flex-col items-center justify-center gap-4 border border-gray-200 rounded-xl bg-white min-h-[200px]">
              <ProcessingStatus />
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Скасувати
              </button>
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
                  defaultSku={defaultSku}
                  defaultProductName={defaultProductName}
                  onSaved={setSavedPath}
                />

                <div className="flex flex-wrap justify-center items-stretch gap-3 w-full max-w-3xl">
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Що виправити при перегенерації: напр. прибери вішак"
                    className="flex-1 min-w-[260px] border border-gray-300 rounded-lg px-3 py-3 text-sm bg-white text-gray-900 placeholder-gray-400"
                  />
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
              {hasMainImage && stage !== "processing" && (
                <button
                  onClick={handleReset}
                  className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Нове фото
                </button>
              )}

              {hasMainImage && stage !== "processing" && (
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
