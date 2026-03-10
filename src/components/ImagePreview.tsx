"use client";

interface ImagePreviewProps {
  src: string;
  label: string;
}

export default function ImagePreview({ src, label }: ImagePreviewProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
        {label}
      </span>
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          className="max-w-full max-h-[400px] object-contain"
        />
      </div>
    </div>
  );
}
