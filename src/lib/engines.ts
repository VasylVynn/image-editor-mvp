// Client-safe registry of generation engines (no server imports).

export interface Engine {
  id: string;
  label: string;
  provider: "gemini" | "fal";
  falEndpoint?: string;
  /** Output size tier ("0.5K" | "1K" | "2K" | "4K"); default 2K. Applies to
   *  the Gemini provider and to fal Nano Banana endpoints. */
  imageSize?: string;
  /** Endpoint accepts exactly one input image (no refs, no color swatch). */
  singleImage?: boolean;
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
    imageSize: "1K",
    price: "$0.08",
    description:
      "Новіше покоління сім'ї Google. 1K (~896×1200 — трохи менше таргета) за $0.08 замість $0.12 за 2K.",
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
  {
    id: "fal-kontext-pro",
    label: "FLUX.1 Kontext Pro (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/flux-pro/kontext",
    singleImage: true,
    price: "$0.04",
    description:
      "Заточена під збереження обʼєкта без перемальовування. Один вхід — без референсів і свотча (фон текстом).",
  },
  {
    id: "fal-kontext-max",
    label: "FLUX.1 Kontext Max (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/flux-pro/kontext/max",
    singleImage: true,
    price: "$0.08",
    description: "Топ-версія Kontext. Теж один вхід, без референсів.",
  },
  {
    id: "fal-flux-2-pro",
    label: "FLUX.2 Pro (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/flux-2-pro/edit",
    price: "~$0.05",
    description: "Прокачаний FLUX.2 ($0.03 перший MP + $0.015 далі). Точний розмір пресета.",
  },
  {
    id: "fal-hidream-o1",
    label: "HiDream O1 (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/hidream-o1-image/dev/edit",
    price: "~$0.01",
    description: "Найдешевша ($0.005/MP). Якість — лотерея, але за копійки варто спробувати.",
  },
  {
    id: "fal-firered",
    label: "Firered Edit (fal)",
    provider: "fal",
    falEndpoint: "fal-ai/firered-image-edit",
    price: "~$0.065",
    description: "Редактор від Xiaohongshu (RED). Свіжа китайська школа, точний розмір.",
  },
  {
    id: "fal-gpt-image-2-medium",
    label: "GPT Image 2 medium (fal)",
    provider: "fal",
    falEndpoint: "openai/gpt-image-2/edit",
    price: "~$0.04",
    description:
      "OpenAI — та сама лінійка, що в ChatGPT, але quality medium: у 4 рази дешевше за high. Вихід 1024×1536.",
  },
];

// Unknown/missing id falls back to the default engine — old clients keep working.
export function getEngine(id: string | undefined | null): Engine {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0];
}
