"use client";

export interface CompareViewProps {
  originalUrl: string;
  referenceUrl: string | null;
  resultImage: string;
}

export default function CompareView({
  originalUrl,
  referenceUrl,
  resultImage,
}: CompareViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
          Оригінал
        </span>
        <div className="w-full border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={originalUrl}
            alt="Оригінал"
            className="w-full h-[400px] object-contain"
          />
        </div>
        {referenceUrl && (
          <div className="flex flex-col items-center gap-1 mt-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Референс
            </span>
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={referenceUrl}
                alt="Референс"
                className="w-24 h-24 object-contain"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
          Результат
        </span>
        <div className="w-full border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultImage}
            alt="Результат"
            className="w-full h-[400px] object-contain"
          />
        </div>
      </div>
    </div>
  );
}
