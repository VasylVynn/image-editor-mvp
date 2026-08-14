"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UploadPanelProps {
  onImagesChange: (main: File | null, reference: File | null) => void;
  disabled: boolean;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILES = 2;

export default function UploadPanel({ onImagesChange, disabled }: UploadPanelProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [mainIndex, setMainIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep object URLs in sync with the current file list.
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  useEffect(() => {
    const main = files[mainIndex] ?? files[0] ?? null;
    const reference =
      files.length === MAX_FILES ? files[mainIndex === 0 ? 1 : 0] : null;
    onImagesChange(main, reference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, mainIndex]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const valid = Array.from(incoming).filter((file) =>
        ACCEPTED_TYPES.includes(file.type)
      );
      if (valid.length === 0) return;
      setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES));
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      addFiles(e.dataTransfer.files);
    },
    [addFiles, disabled]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = "";
    },
    [addFiles]
  );

  const handleRemove = useCallback(
    (index: number) => {
      setFiles((prev) => prev.filter((_, i) => i !== index));
      setMainIndex((prevMain) => {
        if (index === prevMain) return 0;
        if (index < prevMain) return prevMain - 1;
        return prevMain;
      });
    },
    []
  );

  const handleSetMain = useCallback((index: number) => {
    setMainIndex(index);
  }, []);

  const canAddMore = files.length < MAX_FILES;

  return (
    <div className="space-y-4">
      {canAddMore && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-10 text-center cursor-pointer
            transition-colors duration-200
            ${isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400 bg-gray-50"}
            ${disabled ? "opacity-50 pointer-events-none" : ""}
          `}
        >
          <div className="flex flex-col items-center gap-3">
            <svg
              className="w-10 h-10 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-gray-700 font-medium">
              Перетягніть 1–2 фото або натисніть
            </p>
            <p className="text-sm text-gray-500">PNG, JPG або WebP до 10МБ</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={handleFileInput}
            className="hidden"
            disabled={disabled}
          />
        </div>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-4 max-w-md">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="relative border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm"
            >
              {files.length === MAX_FILES && (
                <button
                  type="button"
                  onClick={() => handleSetMain(index)}
                  disabled={disabled}
                  className={`absolute top-2 left-2 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                    index === mainIndex
                      ? "bg-blue-600 text-white"
                      : "bg-white/90 text-gray-700 hover:bg-white"
                  }`}
                >
                  {index === mainIndex ? "Основне" : "Референс"}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                className="absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-medium bg-white/90 text-red-600 hover:bg-white"
              >
                Прибрати
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews[index]}
                alt={index === mainIndex ? "Основне" : "Референс"}
                className="w-full h-40 object-contain bg-gray-50"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
