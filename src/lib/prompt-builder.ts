import type { Preset } from "./preset-schema";

export interface PromptInput {
  preset: Preset;
  analysis?: string;
  note?: string;
  /** "hex": state the background as a hex code (Gemini follows it fine).
   *  "reference": refer to an attached solid-color swatch image instead —
   *  Seedream/FLUX misread hex codes in text (one run painted "#E99999"
   *  onto the image) but match an attached color reference well. */
  colorMode?: "hex" | "reference";
}

// Final prompt = generated format header (from preset fields) + the preset's
// editable processing instruction + optional analysis fragment + operator note.
// The header is the only place size/background/centering are stated, so the
// editable instruction can't drift out of sync with the preset fields.
export function buildPrompt({ preset, analysis, note, colorMode = "hex" }: PromptInput): string {
  // The format header is English on purpose: non-Google engines follow
  // English far better than Ukrainian for format constraints.
  const backgroundClause =
    colorMode === "reference"
      ? `Background: a solid, perfectly uniform backdrop that exactly matches the color of the ` +
        `last attached image (a flat color swatch provided only as a color reference — do not ` +
        `include the swatch itself in the composition) — flat and even, no gradients, no ` +
        `vignetting, no warm or beige tint, no texture.`
      : `Background: a solid, perfectly uniform backdrop of exactly the color ${preset.background} — ` +
        `flat and even, no gradients, no vignetting, no warm or beige tint, no texture.`;
  const sections = [
    `Output format: ${preset.width} × ${preset.height} px (aspect ratio ${preset.aspectRatio}). ` +
      backgroundClause +
      ` The product is centered and fills the frame proportionally with even margins. ` +
      `Never render any text, watermarks, labels or color codes on the image.`,
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
