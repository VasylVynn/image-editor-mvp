import type { Preset } from "./presets";

export interface PromptInput {
  preset: Preset;
  analysis?: string;
  note?: string;
}

export function buildPrompt({ preset, analysis, note }: PromptInput): string {
  const sections = [
    "Prepare this product photo for an e-commerce catalog of children's clothing.",
    `Place the product on a clean, uniform ${preset.background} background, perfectly centered, ` +
      `as a neat, tidy flat-lay (as if freshly ironed), filling the frame proportionally with even margins.`,
    `Target output: portrait ${preset.width} x ${preset.height} px (aspect ratio ${preset.aspectRatio}).`,
    "Remove everything that is not the product: hangers, hands, price tags, clutter, other items, watermarks.",
    "CRITICAL: do not change the product itself. Keep the exact same shape, cut, colors, fabric texture, " +
      "prints, logos, text, buttons, zippers, laces, stitching and proportions as in the original photo. " +
      "Sleeves and trouser legs must stay symmetrical. Do not add, remove or redesign any element of the product. " +
      "If a set has multiple pieces, keep every piece and their arrangement.",
  ];
  if (analysis?.trim()) {
    sections.push(`Preserve exactly these observed details:\n${analysis.trim()}`);
  }
  if (note?.trim()) {
    sections.push(`Additional operator instruction: ${note.trim()}`);
  }
  return sections.join("\n\n");
}
