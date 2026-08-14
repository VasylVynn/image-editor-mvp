"use client";

export default function ProcessingStatus() {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      <p className="text-gray-700 font-medium">
        Обробляємо фото… (10–30 секунд)
      </p>
    </div>
  );
}
