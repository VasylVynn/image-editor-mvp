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
  // The format header is English on purpose: non-Google engines (Seedream,
  // FLUX) follow English far better and were observed drifting the background
  // to warm/beige when the hex was stated in Ukrainian text.
  const sections = [
    `Output format: ${preset.width} × ${preset.height} px (aspect ratio ${preset.aspectRatio}). ` +
      `Background: a solid, perfectly uniform backdrop of exactly the color ${preset.background} — ` +
      `flat and even, no gradients, no vignetting, no warm or beige tint, no texture. ` +
      `The product is centered and fills the frame proportionally with even margins.`,
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
