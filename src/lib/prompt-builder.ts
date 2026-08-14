import type { Preset } from "./preset-schema";

export interface PromptInput {
  preset: Preset;
  analysis?: string;
  note?: string;
}

// Final prompt = generated format header (from preset fields) + the preset's
// editable processing instruction + optional analysis fragment + operator note.
// The header is the only place size/background/centering are stated, so the
// editable instruction can't drift out of sync with the preset fields.
export function buildPrompt({ preset, analysis, note }: PromptInput): string {
  const sections = [
    `Формат: ${preset.width} × ${preset.height} px (співвідношення сторін ${preset.aspectRatio}). ` +
      `Фон: суцільний рівномірний ${preset.background}. ` +
      `Товар відцентрований і пропорційно заповнює кадр з рівними полями.`,
    preset.prompt.trim(),
  ];
  if (analysis?.trim()) {
    sections.push(
      `Обов'язково збережи ці деталі без змін (з аналізу фото):\n${analysis.trim()}`
    );
  }
  if (note?.trim()) {
    sections.push(`Додаткова інструкція оператора: ${note.trim()}`);
  }
  return sections.join("\n\n");
}
