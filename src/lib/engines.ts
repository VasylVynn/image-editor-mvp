// Client-safe registry of generation engines (no server imports).

export interface Engine {
  id: string;
  label: string;
  provider: "gemini" | "fal";
  falEndpoint?: string;
  /** Approximate cost per generation in USD, shown to the operator. */
  price: string;
  /** One-line Ukrainian description for the UI. */
  description: string;
}

export const ENGINES: Engine[] = [
  {
    id: "gemini",
    label: "Gemini — Nano Banana Pro",
    provider: "gemini",
    price: "~$0.13",
    description:
      "Основна модель Google (2K). Найкраще розуміє складні інструкції та аналіз деталей.",
  },
  {
    id: "fal-nano-banana-2",
    label: "Nano Banana 2 (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/nano-banana-2/edit",
    price: "~$0.12",
    description:
      "Новіше покоління тієї ж сім'ї Google, через fal (2K: $0.08 × 1.5). Варто порівняти з основною.",
  },
  {
    id: "fal-seedream",
    label: "Seedream 4.5 (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/bytedance/seedream/v4.5/edit",
    price: "$0.04",
    description:
      "ByteDance. Найдешевша, добре тримає деталі й текстуру тканини. Кандидат на щоденну роботу.",
  },
  {
    id: "fal-flux-2",
    label: "FLUX.2 (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/flux-2/edit",
    price: "~$0.04",
    description:
      "Black Forest Labs ($0.012/мегапіксель). Видає точний розмір пресета. Швидка (~9 с).",
  },
  {
    id: "fal-seedream-5-lite",
    label: "Seedream 5.0 Lite (fal)",
    provider: "fal",
    falEndpoint: "bytedance/seedream/v5/lite/edit",
    price: "$0.035",
    description: "Новіше покоління Seedream за ціною 4.5. Точний розмір пресета.",
  },
  {
    id: "fal-seedream-5-pro",
    label: "Seedream 5.0 Pro (fal)",
    provider: "fal",
    falEndpoint: "bytedance/seedream/v5/pro/edit",
    price: "~$0.07",
    description:
      "Точкове редагування: міняє потрібне, тримає решту кадру недоторканою. Головний кандидат на якість.",
  },
  {
    id: "fal-qwen-2-pro",
    label: "Qwen Image 2 Pro (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/qwen-image-2/pro/edit",
    price: "$0.075",
    description: "Alibaba. Дуже точно слідує інструкціям, сильна з текстом і принтами.",
  },
];

// Unknown/missing id falls back to the default engine — old clients keep working.
export function getEngine(id: string | undefined | null): Engine {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0];
}
