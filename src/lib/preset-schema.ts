// Client-safe preset shape + validation (no fs imports — used by browser pages too).

export interface Preset {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  aspectRatio: string;
  outputDir: string;
  /** Editable per-store processing instruction; the size/background/centering
   *  header is generated from the fields above and prepended automatically. */
  prompt: string;
}

// Default instruction, based on the operator's proven wording. Deliberately
// does NOT re-lay or "iron" the garment — the set and arrangement must stay
// exactly as photographed.
export const DEFAULT_PRESET_PROMPT = [
  "Підготуй фото товару для каталогу інтернет-магазину дитячого одягу.",
  "Прибери з кадру все зайве: вішаки, руки, цінники, сторонні предмети, водяні знаки, візуальний шум і артефакти. На фото має бути лише товар.",
  "КРИТИЧНО: сам товар не змінюй. Комплект і розкладка мають лишитися такими ж, як на фото. Збережи точну форму, крій, колір, матеріал, текстуру тканини, всі принти, написи, ґудзики, блискавки, кишені та інші деталі. Рукави та штанини мають бути однакові, як в оригіналі. Нічого не додавай, не прибирай і не перемальовуй на товарі. Якщо це комплект — збережи всі предмети комплекту та їхнє розташування.",
  "Результат: чисте каталожне фото, готове для онлайн-каталогу.",
].join("\n");

export const ALLOWED_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Returns a list of Ukrainian, user-facing validation errors; empty list = valid.
// PUT bodies are arbitrary JSON — never assume entries have the right shape or types.
export function validatePresets(presets: Preset[]): string[] {
  if (!Array.isArray(presets) || presets.length === 0) {
    return ["Потрібен щонайменше один пресет"];
  }
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const str = (value: unknown): string => (typeof value === "string" ? value : "");
  presets.forEach((raw, index) => {
    const preset = (raw ?? {}) as Record<keyof Preset, unknown>;
    const id = str(preset.id).trim();
    const name = str(preset.name).trim();
    const label = name || `#${index + 1}`;
    if (!id) {
      errors.push(`Пресет ${label}: порожній id`);
    } else if (seenIds.has(id)) {
      errors.push(`Пресет ${label}: id "${id}" повторюється`);
    } else {
      seenIds.add(id);
    }
    if (!name) errors.push(`Пресет #${index + 1}: вкажіть назву`);
    if (typeof preset.width !== "number" || !Number.isFinite(preset.width) || preset.width <= 0) {
      errors.push(`Пресет ${label}: некоректна ширина`);
    }
    if (typeof preset.height !== "number" || !Number.isFinite(preset.height) || preset.height <= 0) {
      errors.push(`Пресет ${label}: некоректна висота`);
    }
    if (!HEX_COLOR.test(str(preset.background))) {
      errors.push(`Пресет ${label}: колір фону має бути hex, напр. #E9E9E9`);
    }
    if (!(ALLOWED_ASPECT_RATIOS as readonly string[]).includes(str(preset.aspectRatio))) {
      errors.push(`Пресет ${label}: співвідношення сторін має бути одне з: ${ALLOWED_ASPECT_RATIOS.join(", ")}`);
    }
    if (!str(preset.outputDir).trim()) errors.push(`Пресет ${label}: вкажіть папку збереження`);
    if (!str(preset.prompt).trim()) errors.push(`Пресет ${label}: вкажіть інструкцію обробки`);
  });
  return errors;
}
