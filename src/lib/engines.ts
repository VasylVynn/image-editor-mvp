// Client-safe registry of generation engines (no server imports).

export interface Engine {
  id: string;
  label: string;
  provider: "gemini" | "fal";
  falEndpoint?: string;
  /** Output size tier ("0.5K" | "1K" | "2K" | "4K"); default 2K. Applies to
   *  the Gemini provider and to fal Nano Banana endpoints. */
  imageSize?: string;
  /** How the background color reaches the model: attached swatch image
   *  ("reference", fal default) or hex in the prompt text ("hex" — what the
   *  Gemini family follows best; the swatch confuses it). */
  colorMode?: "hex" | "reference";
  /** Quality tier for GPT Image endpoints ("low" | "medium" | "high"). */
  quality?: string;
  /** Approximate cost per generation in USD, shown to the operator. */
  price: string;
  /** Numeric cost per generation for analytics math. */
  priceUsd: number;
  /** One-line Ukrainian description for the UI. */
  description: string;
}

export const ENGINES: Engine[] = [
  {
    id: "gemini",
    priceUsd: 0.134,
    label: "Gemini — Nano Banana Pro",
    provider: "gemini",
    price: "~$0.13",
    description:
      "Основна модель Google (2K). Найкраще розуміє складні інструкції та аналіз деталей.",
  },
  {
    id: "fal-nano-banana-2",
    priceUsd: 0.08,
    label: "Nano Banana 2 (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/nano-banana-2/edit",
    imageSize: "1K",
    colorMode: "hex",
    price: "$0.08",
    description:
      "Новіше покоління сім'ї Google. 1K (~896×1200) за $0.08. Фон hex-текстом, як у Gemini — без свотча.",
  },
  {
    id: "fal-seedream",
    priceUsd: 0.04,
    label: "Seedream 4.5 (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/bytedance/seedream/v4.5/edit",
    price: "$0.04",
    description:
      "ByteDance. Найдешевша, добре тримає деталі й текстуру тканини. Кандидат на щоденну роботу.",
  },
  {
    id: "fal-seedream-5-lite",
    priceUsd: 0.035,
    label: "Seedream 5.0 Lite (fal)",
    provider: "fal",
    falEndpoint: "bytedance/seedream/v5/lite/edit",
    price: "$0.035",
    description: "Новіше покоління Seedream за ціною 4.5. Точний розмір пресета.",
  },
  {
    id: "fal-seedream-5-pro",
    priceUsd: 0.07,
    label: "Seedream 5.0 Pro (fal)",
    provider: "fal",
    falEndpoint: "bytedance/seedream/v5/pro/edit",
    price: "~$0.07",
    description:
      "Точкове редагування: міняє потрібне, тримає решту кадру недоторканою. Головний кандидат на якість.",
  },
  {
    id: "fal-gpt-image-2-medium",
    priceUsd: 0.042,
    label: "GPT Image 2 medium (fal)",
    provider: "fal",
    falEndpoint: "openai/gpt-image-2/edit",
    quality: "medium",
    price: "~$0.04",
    description:
      "OpenAI — та сама лінійка, що в ChatGPT, але quality medium: у 4 рази дешевше за high. Вихід 1024×1536.",
  },
  {
    id: "fal-gpt-image-2-high",
    priceUsd: 0.13,
    label: "GPT Image 2 high (fal)",
    provider: "fal",
    falEndpoint: "openai/gpt-image-2/edit",
    quality: "high",
    price: "~$0.13",
    description:
      "Та сама якість, що в ChatGPT (high). Найточніше промальовування принтів у лінійці OpenAI.",
  },
];

// Unknown/missing id falls back to the default engine — old clients keep working.
export function getEngine(id: string | undefined | null): Engine {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0];
}
