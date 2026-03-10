"use client";

import { useState, useCallback } from "react";
import ImageUploader from "@/components/ImageUploader";
import ImagePreview from "@/components/ImagePreview";
import ProcessingStatus from "@/components/ProcessingStatus";
import DownloadButton from "@/components/DownloadButton";

type ProcessingMode = "local" | "replicate" | "openai-1.5";

const MODE_OPTIONS: { value: ProcessingMode; label: string }[] = [
  { value: "local", label: "Локальне" },
  { value: "replicate", label: "Replicate" },
  { value: "openai-1.5", label: "OpenAI 1.5" },
];

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ProcessingMode>("local");

  const handleFileSelected = useCallback((file: File) => {
    setOriginalFile(file);
    setOriginalImage(URL.createObjectURL(file));
    setProcessedImage(null);
    setError(null);
  }, []);

  const handleProcess = useCallback(async () => {
    if (!originalFile) return;

    setIsProcessing(true);
    setError(null);
    setProcessedImage(null);

    try {
      const formData = new FormData();
      formData.append("image", originalFile);
      formData.append("mode", mode);

      const response = await fetch("/api/process-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Processing failed");
      }

      const blob = await response.blob();
      setProcessedImage(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsProcessing(false);
    }
  }, [originalFile, mode]);

  const handleModeChange = useCallback(
    (newMode: ProcessingMode) => {
      if (newMode === mode) return;
      if (processedImage) {
        const confirmed = window.confirm(
          "Зміна режиму скине поточний результат. Продовжити?"
        );
        if (!confirmed) return;
        URL.revokeObjectURL(processedImage);
        setProcessedImage(null);
        setError(null);
      }
      setMode(newMode);
    },
    [mode, processedImage]
  );

  const handleReset = useCallback(() => {
    if (originalImage) URL.revokeObjectURL(originalImage);
    if (processedImage) URL.revokeObjectURL(processedImage);
    setOriginalImage(null);
    setOriginalFile(null);
    setProcessedImage(null);
    setError(null);
  }, [originalImage, processedImage]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">
            Редактор зображень товарів
          </h1>
          <p className="text-gray-600 mt-2">
            Завантажте фото товару — видалимо фон, відцентруємо та поставимо на сірий фон
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex flex-wrap justify-center bg-white rounded-lg border border-gray-200 p-1 shadow-sm gap-0.5">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleModeChange(opt.value)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === opt.value
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Upload Area */}
        {!originalImage && (
          <ImageUploader
            onFileSelected={handleFileSelected}
            disabled={isProcessing}
          />
        )}

        {/* Images + Controls */}
        {originalImage && (
          <div className="space-y-6">
            {/* Image Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ImagePreview src={originalImage} label="Оригінал" />
              {processedImage ? (
                <ImagePreview src={processedImage} label="Результат" />
              ) : (
                <div className="flex items-center justify-center border border-gray-200 rounded-xl bg-white min-h-[300px]">
                  {isProcessing ? (
                    <ProcessingStatus mode={mode} />
                  ) : (
                    <p className="text-gray-400">
                      Натисніть &quot;Обробити&quot; щоб побачити результат
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-center">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-center gap-4">
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Нове зображення
              </button>

              {!processedImage && !isProcessing && (
                <button
                  onClick={handleProcess}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Обробити
                </button>
              )}

              {processedImage && (
                <DownloadButton
                  imageUrl={processedImage}
                  filename={
                    originalFile
                      ? originalFile.name.replace(/\.[^.]+$/, "") + "-processed.png"
                      : "product-processed.png"
                  }
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
