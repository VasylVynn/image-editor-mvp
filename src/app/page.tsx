"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import UploadPanel from "@/components/UploadPanel";
import ProductUrlPanel from "@/components/ProductUrlPanel";
import ProcessingStatus from "@/components/ProcessingStatus";
import CompareView from "@/components/CompareView";
import SaveForm from "@/components/SaveForm";
import Link from "next/link";
import type { Preset } from "@/lib/preset-schema";
import { ENGINES, priceTier } from "@/lib/engines";
import { UPSCALERS } from "@/lib/upscalers";
import {
  saveSession,
  loadSession,
  clearSession,
  saveSettings,
  loadSettings,
  clearSettings,
} from "@/lib/session-store";

type Stage = "idle" | "processing" | "done";
type Mode = "file" | "url";
type Pipeline = "auto" | "deterministic" | "generative";

interface ProcessResult {
  image: string;
  promptUsed: string;
  analysis: string | null;
  analysisFailed: boolean;
  upscaleFailed?: boolean;
  /** Engine that produced this result — voting target. */
  model?: string;
  /** Which path produced the result. */
  pipeline?: "deterministic" | "generative";
  /** How the model output was normalized to the preset size ("resize" | null). */
  finalize?: "resize" | null;
  finalizeFailed?: boolean;
  /** Why auto mode fell back to generation (deterministic gate reason). */
  deterministicReason?: string | null;
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
  // Extra references (up to 4) the operator can attach in the result view.
  const MAX_EXTRA_FILES = 4;
  const [extraFiles, setExtraFiles] = useState<File[]>([]);

  // URL-mode: product page fetch + gallery selection.
  const [productTitle, setProductTitle] = useState<string | null>(null);
  const [productSku, setProductSku] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [mainUrl, setMainUrl] = useState<string | null>(null);
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [extraUrls, setExtraUrls] = useState<string[]>([]);
  // Regenerate from the previous generated result instead of the originals.
  const [fromResult, setFromResult] = useState(false);

  const [note, setNote] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState("default");
  const [engineId, setEngineId] = useState("gemini");
  const [upscale, setUpscale] = useState(false);
  const [upscalerId, setUpscalerId] = useState("recraft");
  const [analyze, setAnalyze] = useState(true);
  const [pipeline, setPipeline] = useState<Pipeline>("auto");
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [skuCopied, setSkuCopied] = useState(false);

  const [fileOriginalUrl, setFileOriginalUrl] = useState<string | null>(null);
  const [fileReferenceUrl, setFileReferenceUrl] = useState<string | null>(null);

  // Bumped on reset to force UploadPanel/ProductUrlPanel to remount, clearing
  // their internal state (file/thumbnail selection, URL text, in-flight
  // fetch) that isn't otherwise controlled by the page. This also aborts any
  // fetch-product request still in flight when a remount tears it down,
  // preventing a stale response from repopulating cleared state.
  const [uploadKey, setUploadKey] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Groups every attempt on one product photo in the events log; the attempt
  // counter turns regenerate notes into labeled failure examples.
  const sessionIdRef = useRef<string | null>(null);
  const attemptRef = useRef(0);

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

  // Restore persisted settings and the last finished session on first mount,
  // so a page reload doesn't lose an already-paid-for result.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const settings = loadSettings();
    if (settings) {
      if (settings.presetId) setPresetId(settings.presetId);
      if (settings.engineId) setEngineId(settings.engineId);
      if (typeof settings.analyze === "boolean") setAnalyze(settings.analyze);
      if (
        settings.pipeline === "auto" ||
        settings.pipeline === "deterministic" ||
        settings.pipeline === "generative"
      ) {
        setPipeline(settings.pipeline);
      }
      if (typeof settings.upscale === "boolean") setUpscale(settings.upscale);
      if (settings.upscalerId) setUpscalerId(settings.upscalerId);
      if (typeof settings.note === "string") setNote(settings.note);
      if (settings.mode === "file" || settings.mode === "url") setMode(settings.mode);
    }

    loadSession().then((session) => {
      if (!session) return;
      setMode(session.mode);
      setProductTitle(session.productTitle);
      setProductSku(session.productSku);
      setGalleryImages(session.galleryImages);
      setMainUrl(session.mainUrl);
      setRefUrl(session.refUrl);
      setExtraUrls(session.extraUrls ?? []);
      if (session.main) {
        setMainFile(new File([session.main.blob], session.main.name, { type: session.main.type }));
      }
      if (session.ref) {
        setRefFile(new File([session.ref.blob], session.ref.name, { type: session.ref.type }));
      }
      const persistedExtras = session.extras ?? (session.extra ? [session.extra] : []);
      setExtraFiles(
        persistedExtras.map((f) => new File([f.blob], f.name, { type: f.type }))
      );
      setSavedPath(session.savedPath);
      sessionIdRef.current = session.sessionId ?? null;
      attemptRef.current = session.attempt ?? 0;
      // Legacy persisted records may carry "recompose" from before the
      // finalize step became size-only — drop it rather than mislabel.
      const { finalize, ...restored } = session.result;
      updateResult({ ...restored, finalize: finalize === "recompose" ? null : finalize });
      setStage("done");
    });
  }, [updateResult]);

  // Persist the cheap settings on every change.
  useEffect(() => {
    if (!restoredRef.current) return;
    saveSettings({ presetId, engineId, analyze, upscale, upscalerId, note, mode, pipeline });
  }, [presetId, engineId, analyze, upscale, upscalerId, note, mode, pipeline]);

  // Persist the finished session (result + sources) whenever it changes.
  useEffect(() => {
    if (!result || stage !== "done") return;
    saveSession({
      mode,
      main: mainFile ? { blob: mainFile, name: mainFile.name, type: mainFile.type } : null,
      ref: refFile ? { blob: refFile, name: refFile.name, type: refFile.type } : null,
      extras: extraFiles.map((f) => ({ blob: f, name: f.name, type: f.type })),
      productTitle,
      productSku,
      galleryImages,
      sessionId: sessionIdRef.current,
      attempt: attemptRef.current,
      mainUrl,
      refUrl,
      extraUrls,
      result,
      savedPath,
    });
  }, [result, stage, savedPath, mode, mainFile, refFile, extraFiles, productTitle, productSku, galleryImages, mainUrl, refUrl, extraUrls]);

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

  const [extraPreviewUrls, setExtraPreviewUrls] = useState<string[]>([]);
  useEffect(() => {
    const urls = extraFiles.map((file) => URL.createObjectURL(file));
    setExtraPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [extraFiles]);

  // URL mode uses the remote URLs directly — no object URL lifecycle needed.
  const originalUrl = mode === "file" ? fileOriginalUrl : mainUrl;
  const referenceUrl = mode === "file" ? fileReferenceUrl : refUrl;

  const handleImagesChange = useCallback((main: File | null, reference: File | null) => {
    setMainFile((previous) => {
      // A different main photo is a different product — start a fresh
      // attempt chain in the events log.
      if (main !== previous) {
        sessionIdRef.current = null;
        attemptRef.current = 0;
      }
      return main;
    });
    setRefFile(reference);
  }, []);

  const handleProductLoaded = useCallback((product: ProductInfo) => {
    setProductTitle(product.title);
    setProductSku(product.sku);
    setGalleryImages(product.images);
    setMainUrl(null);
    setRefUrl(null);
    setExtraUrls([]);
    setFromResult(false);
    // New product page fetched — new attempt chain.
    sessionIdRef.current = null;
    attemptRef.current = 0;
  }, []);

  // A different main photo is a different source — the events chain
  // (attempt → note → attempt) only makes sense within one source photo.
  const resetAttemptChain = useCallback(() => {
    sessionIdRef.current = null;
    attemptRef.current = 0;
    setFromResult(false);
  }, []);

  // Cycle a gallery thumbnail: none -> Основне -> Референс -> Додаткове -> none.
  // Основне/Референс are single-slot; Додаткове can hold several (shared cap
  // of 4 with the file-mode extras). Works after generation too, so the
  // operator can reshuffle the selection before a regenerate.
  const cycleThumbnail = useCallback(
    (img: string) => {
      if (mainUrl === img) {
        setMainUrl(null);
        setRefUrl(img);
        resetAttemptChain();
      } else if (refUrl === img) {
        setRefUrl(null);
        // When the shared extras cap is already full the cycle skips the
        // «Додаткове» state and lands on «нічого» — deliberate, not a drop.
        setExtraUrls((prev) =>
          prev.length + extraFiles.length < MAX_EXTRA_FILES ? [...prev, img] : prev
        );
      } else if (extraUrls.includes(img)) {
        setExtraUrls((prev) => prev.filter((u) => u !== img));
      } else {
        setMainUrl(img);
        resetAttemptChain();
      }
    },
    [mainUrl, refUrl, extraUrls, extraFiles.length, resetAttemptChain]
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

    if (!sessionIdRef.current) {
      sessionIdRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    attemptRef.current += 1;

    try {
      const formData = new FormData();
      const previousResult = resultRef.current;
      if (fromResult && previousResult) {
        // Iterate on the last generated image: it becomes the main input, the
        // reference/extras/note still apply as usual.
        const blob = await (await fetch(previousResult.image)).blob();
        formData.append("image", new File([blob], "result.png", { type: blob.type || "image/png" }));
        if (mode === "file") {
          if (refFile) formData.append("reference", refFile);
        } else if (refUrl) {
          formData.append("referenceUrl", refUrl);
        }
      } else if (mode === "file") {
        formData.append("image", mainFile as File);
        if (refFile) formData.append("reference", refFile);
      } else {
        formData.append("imageUrl", mainUrl as string);
        if (refUrl) formData.append("referenceUrl", refUrl);
      }
      if (mode === "url") {
        extraUrls.forEach((url) => formData.append("extraUrl", url));
      }
      // «Лише фон» takes no instructions — the field is disabled in the UI
      // and the value must not leak to the server from the kept state.
      formData.append("note", pipeline === "deterministic" ? "" : note);
      formData.append("presetId", presetId);
      formData.append("analyze", String(analyze));
      formData.append("model", engineId);
      formData.append("upscale", String(upscale));
      formData.append("upscaler", upscalerId);
      formData.append("pipeline", pipeline);
      formData.append("sessionId", sessionIdRef.current);
      formData.append("attempt", String(attemptRef.current));
      extraFiles.forEach((file) => formData.append("extra", file));

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
  }, [mode, mainFile, refFile, extraFiles, mainUrl, refUrl, extraUrls, fromResult, note, presetId, analyze, pipeline, engineId, upscale, upscalerId, updateResult]);

  // Cancels an in-flight request and returns to a sane state. The fetch's own
  // AbortError branch above is a no-op, so this is the sole place that decides
  // the post-cancel stage — no race with the aborted request's rejection.
  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setStage(resultRef.current ? "done" : "idle");
  }, []);


  // «Наступне фото» (URL mode): keeps the fetched product and its gallery,
  // clears only the selection, result and note — the operator moves on to the
  // next photo of the same product. A different photo = a new attempt chain.
  const handleNextPhoto = useCallback(() => {
    abortControllerRef.current?.abort();
    setMainUrl(null);
    setRefUrl(null);
    setExtraUrls([]);
    setExtraFiles([]);
    setFromResult(false);
    setNote("");
    setStage("idle");
    updateResult(null);
    setError(null);
    setSavedPath(null);
    sessionIdRef.current = null;
    attemptRef.current = 0;
    void clearSession();
  }, [updateResult]);

  // «Нове фото» / «Новий товар»: clears the work in progress (photos, gallery,
  // result, note) and the persisted session, but keeps the operator's settings
  // (preset, model, toggles) — they rarely change between photos.
  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort();
    setMainFile(null);
    setRefFile(null);
    setExtraFiles([]);
    setProductTitle(null);
    setProductSku(null);
    setGalleryImages([]);
    setMainUrl(null);
    setRefUrl(null);
    setExtraUrls([]);
    setFromResult(false);
    setNote("");
    setStage("idle");
    updateResult(null);
    setError(null);
    setSavedPath(null);
    setUploadKey((k) => k + 1);
    sessionIdRef.current = null;
    attemptRef.current = 0;
    void clearSession();
  }, [updateResult]);

  // «Скинути все»: everything back to factory defaults, including settings.
  const handleResetAll = useCallback(() => {
    handleReset();
    setMode("file");
    setPresetId("default");
    setEngineId("gemini");
    setAnalyze(true);
    setUpscale(false);
    setUpscalerId("recraft");
    setPipeline("auto");
    clearSettings();
  }, [handleReset]);

  // Extra-photo chips + file picker, shared by the idle URL-mode block and the
  // regenerate row. Manual files and gallery «Додаткове» picks share the cap.
  const extraFilesPicker = (
    <>
      {extraFiles.map((file, index) => (
        <span
          key={`${file.name}-${index}`}
          className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-sm text-gray-700"
        >
          {extraPreviewUrls[index] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={extraPreviewUrls[index]}
              alt={`Додаткове фото ${index + 1}`}
              className="h-9 w-9 object-cover rounded"
            />
          )}
          <button
            onClick={() => setExtraFiles((prev) => prev.filter((_, i) => i !== index))}
            title="Прибрати додаткове фото"
            className="text-gray-400 hover:text-red-600"
          >
            ✕
          </button>
        </span>
      ))}
      {extraFiles.length + extraUrls.length < MAX_EXTRA_FILES && (
        <label className="flex items-center px-4 py-1.5 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
          + Дод. фото
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) {
                setExtraFiles((prev) =>
                  [...prev, ...files].slice(0, Math.max(0, MAX_EXTRA_FILES - extraUrls.length))
                );
              }
              e.target.value = "";
            }}
          />
        </label>
      )}
    </>
  );

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
        <div className="relative text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">
            Каталог: обробка фото товарів
          </h1>
          <p className="text-gray-600 mt-2">
            Завантажте фото товару — отримайте каталожне зображення на єдиному фоні
          </p>
          <button
            onClick={handleResetAll}
            title="Очистити фото, результат і всі налаштування"
            className="absolute right-0 top-0 text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Скинути все
          </button>
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
                <p className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                  <span>Товар: {productTitle}</span>
                  {productSku && (
                    <span className="inline-flex items-center gap-1">
                      · Код: <b className="text-gray-900">{productSku}</b>
                      <button
                        type="button"
                        title="Скопіювати код"
                        onClick={() => {
                          navigator.clipboard.writeText(productSku);
                          setSkuCopied(true);
                          setTimeout(() => setSkuCopied(false), 1500);
                        }}
                        className="px-1.5 py-0.5 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50"
                      >
                        {skuCopied ? "✓" : "📋"}
                      </button>
                    </span>
                  )}
                </p>
              )}

              {galleryImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {galleryImages.map((img) => {
                    const badge =
                      mainUrl === img
                        ? "main"
                        : refUrl === img
                          ? "ref"
                          : extraUrls.includes(img)
                            ? "extra"
                            : null;
                    return (
                      <button
                        type="button"
                        key={img}
                        onClick={() => cycleThumbnail(img)}
                        disabled={stage === "processing"}
                        className="relative border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm disabled:opacity-50"
                      >
                        {badge && (
                          <span
                            className={`absolute top-2 left-2 px-2 py-1 rounded-md text-xs font-medium ${
                              badge === "main"
                                ? "bg-blue-600 text-white"
                                : badge === "ref"
                                  ? "bg-white/90 text-gray-700"
                                  : "bg-gray-700/90 text-white"
                            }`}
                          >
                            {badge === "main" ? "Основне" : badge === "ref" ? "Референс" : "Додаткове"}
                          </span>
                        )}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt="" className="w-full h-32 object-contain bg-gray-50" />
                      </button>
                    );
                  })}
                </div>
              )}

              {galleryImages.length > 0 && stage !== "done" && (
                <div className="flex flex-wrap items-stretch gap-3">
                  {extraFilesPicker}
                  <span className="flex items-center text-xs text-gray-500">
                    Додаткові фото: з галереї та/або файлами, разом до {MAX_EXTRA_FILES}
                  </span>
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
              Обробка
              <select
                value={pipeline}
                onChange={(e) => setPipeline(e.target.value as Pipeline)}
                disabled={stage === "processing"}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-gray-900"
              >
                <option value="auto">Авто</option>
                <option value="deterministic">Лише фон — без AI, $0</option>
                <option value="generative">Завжди AI</option>
              </select>
            </label>

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
                    {engine.label} {priceTier(engine.priceUsd)}
                  </option>
                ))}
              </select>
            </label>

            <p className="w-full text-xs text-gray-500 -mt-2">
              {ENGINES.find((e) => e.id === engineId)?.description}
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

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={upscale}
                onChange={(e) => setUpscale(e.target.checked)}
                disabled={stage === "processing"}
              />
              Покращити мале фото
            </label>
            {upscale && (
              <select
                value={upscalerId}
                onChange={(e) => setUpscalerId(e.target.value)}
                disabled={stage === "processing"}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-gray-900"
              >
                {UPSCALERS.map((upscaler) => (
                  <option key={upscaler.id} value={upscaler.id}>
                    {upscaler.label} — {upscaler.price}
                  </option>
                ))}
              </select>
            )}

            {stage !== "done" && (
              <input
                type="text"
                value={pipeline === "deterministic" ? "" : note}
                onChange={(e) => setNote(e.target.value)}
                disabled={stage === "processing" || pipeline === "deterministic"}
                placeholder={
                  pipeline === "deterministic"
                    ? "Режим «Лише фон» не виконує текстові інструкції"
                    : "Примітка для моделі (необовʼязково): напр. прибери вішак"
                }
                className="flex-1 min-w-[240px] border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white text-gray-900 placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
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
              {result.upscaleFailed && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm text-center">
                  Апскейл не спрацював, використано оригінальне фото
                </div>
              )}
              {result.finalizeFailed && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm text-center">
                  Нормалізація розміру не спрацювала — розмір і фон як від моделі
                </div>
              )}

              <div className="flex flex-wrap justify-center items-center gap-2">
                {result.pipeline === "deterministic" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-700">
                    ✓ Пікселі товару збережені — оброблено без AI
                  </span>
                ) : result.pipeline === "generative" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
                    AI-генерація{result.finalize === "resize" ? " · розмір нормалізовано" : ""}
                  </span>
                ) : null}
                {result.pipeline === "generative" && result.deterministicReason && (
                  <span className="text-xs text-gray-500">
                    Авто → AI: {result.deterministicReason}
                  </span>
                )}
              </div>

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
                  model={result.model}
                  pipeline={result.pipeline}
                  sessionId={sessionIdRef.current ?? undefined}
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
                  {extraFilesPicker}
                  <label
                    className="flex items-center gap-2 px-3 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white cursor-pointer"
                    title="Наступна генерація візьме за основу вже згенерований результат, а не оригінальне фото"
                  >
                    <input
                      type="checkbox"
                      checked={fromResult}
                      onChange={(e) => setFromResult(e.target.checked)}
                    />
                    Від результату
                  </label>
                  <button
                    onClick={handleProcess}
                    className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Перегенерувати
                  </button>
                  {mode === "url" && galleryImages.length > 0 && (
                    <button
                      onClick={handleNextPhoto}
                      title="Лишити цей товар і галерею, почати наступне фото"
                      className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Наступне фото
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {mode === "url" ? "Новий товар" : "Нове фото"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Idle actions */}
          {stage !== "done" && (
            <div className="flex justify-center gap-4">
              {mode === "url" &&
                galleryImages.length > 0 &&
                stage !== "processing" &&
                (mainUrl || refUrl || extraUrls.length > 0 || extraFiles.length > 0 || note) && (
                  <button
                    onClick={handleNextPhoto}
                    title="Лишити товар і галерею, скинути лише вибір і примітку"
                    className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Наступне фото
                  </button>
                )}
              {hasMainImage && stage !== "processing" && (
                <button
                  onClick={handleReset}
                  className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {mode === "url" ? "Новий товар" : "Нове фото"}
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
