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
      "Black Forest Labs ($0.012/мегапіксель). Єдина, що видає точний розмір пресета. Швидка (~9 с).",
  },
];

// Unknown/missing id falls back to the default engine — old clients keep working.
export function getEngine(id: string | undefined | null): Engine {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0];
}
