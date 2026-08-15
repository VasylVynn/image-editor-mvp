// Client-safe registry of upscalers (no server imports).

export interface Upscaler {
  id: string;
  label: string;
  falEndpoint: string;
  price: string;
  description: string;
}

export const UPSCALERS: Upscaler[] = [
  {
    id: "recraft",
    label: "Recraft Crisp",
    falEndpoint: "fal-ai/recraft/upscale/crisp",
    price: "$0.004",
    description: "Швидкий і майже безкоштовний. Для більшості малих фото достатньо.",
  },
  {
    id: "topaz",
    label: "Topaz Gigapixel",
    falEndpoint: "fal-ai/topaz/upscale/image",
    price: "$0.08",
    description: "Максимальна якість відновлення. Для зовсім поганих фото.",
  },
];

export function getUpscaler(id: string | undefined | null): Upscaler {
  return UPSCALERS.find((u) => u.id === id) ?? UPSCALERS[0];
}
