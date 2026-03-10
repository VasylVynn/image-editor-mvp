"use client";

import { useEffect, useState } from "react";

interface ProcessingStatusProps {
  mode: "local" | "openai";
}

export default function ProcessingStatus({ mode }: ProcessingStatusProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      <div className="text-center">
        <p className="text-gray-700 font-medium">
          {mode === "openai"
            ? "Processing with OpenAI..."
            : "Removing background & centering..."}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {elapsed}s elapsed
          {elapsed > 10 && mode === "local" && (
            <span className="block text-xs mt-1">
              First run may take longer (downloading AI model)
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
