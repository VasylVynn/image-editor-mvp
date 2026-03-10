"use client";

import { useCallback, useState } from "react";

interface ImageUploaderProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function ImageUploader({
  onFileSelected,
  disabled,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        onFileSelected(file);
      }
    },
    [onFileSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelected(file);
      }
    },
    [onFileSelected]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
        transition-colors duration-200
        ${isDragging
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 hover:border-gray-400 bg-gray-50"
        }
        ${disabled ? "opacity-50 pointer-events-none" : ""}
      `}
    >
      <div className="flex flex-col items-center gap-4">
        <svg
          className="w-12 h-12 text-gray-400"
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
        <div>
          <p className="text-lg font-medium text-gray-700">
            Drop your product image here
          </p>
          <p className="text-sm text-gray-500 mt-1">
            PNG, JPG, or WebP up to 10MB
          </p>
        </div>
        <label className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
          Browse files
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileInput}
            className="hidden"
            disabled={disabled}
          />
        </label>
      </div>
    </div>
  );
}
