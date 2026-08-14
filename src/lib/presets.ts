import os from "os";
import path from "path";
import rawConfig from "@/config/presets.json";

export interface Preset {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  aspectRatio: string;
  outputDir: string;
}

export function listPresets(): Preset[] {
  return rawConfig.presets;
}

export function getPreset(id: string): Preset {
  const preset = rawConfig.presets.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset;
}

export function resolveOutputDir(preset: Preset): string {
  return preset.outputDir.startsWith("~")
    ? path.join(os.homedir(), preset.outputDir.slice(1))
    : preset.outputDir;
}
