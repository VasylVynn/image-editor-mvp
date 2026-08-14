import fs from "fs/promises";
import os from "os";
import path from "path";
import { type Preset, validatePresets, DEFAULT_PRESET_PROMPT } from "./preset-schema";

export type { Preset };
export { validatePresets, ALLOWED_ASPECT_RATIOS, DEFAULT_PRESET_PROMPT } from "./preset-schema";

// Runtime read/write (not a static import) so the /presets page can edit
// the file without a server restart. configPath param exists for tests.
const CONFIG_PATH = path.join(process.cwd(), "src", "config", "presets.json");

export async function loadPresets(configPath: string = CONFIG_PATH): Promise<Preset[]> {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as { presets: Preset[] };
  if (!Array.isArray(parsed?.presets)) {
    throw new Error("Файл пресетів пошкоджено: очікується { presets: [...] }");
  }
  // Backfill for files written before the per-preset prompt existed.
  return parsed.presets.map((preset) => ({
    ...preset,
    prompt: preset.prompt ?? DEFAULT_PRESET_PROMPT,
  }));
}

export async function getPreset(id: string, configPath?: string): Promise<Preset> {
  const presets = await loadPresets(configPath);
  const preset = presets.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset;
}

export async function savePresets(
  presets: Preset[],
  configPath: string = CONFIG_PATH
): Promise<void> {
  const errors = validatePresets(presets);
  if (errors.length > 0) throw new Error(errors.join("; "));
  // Atomic write (tmp + rename) so a concurrent read never sees a torn file.
  const tmpPath = `${configPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify({ presets }, null, 2) + "\n");
  await fs.rename(tmpPath, configPath);
}

export function resolveOutputDir(preset: Preset): string {
  return preset.outputDir.startsWith("~")
    ? path.join(os.homedir(), preset.outputDir.slice(1))
    : preset.outputDir;
}
