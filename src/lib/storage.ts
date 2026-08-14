import fs from "fs/promises";
import path from "path";
import { type Preset, resolveOutputDir } from "./presets";

export interface SaveInput {
  imageBase64: string;
  filenameBase: string;
  preset: Preset;
  promptUsed?: string;
  sku?: string;
  productName?: string;
}

export interface SaveOutput {
  filePath: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function saveResult(
  input: SaveInput,
  outputDirOverride?: string
): Promise<SaveOutput> {
  const dir = outputDirOverride ?? resolveOutputDir(input.preset);
  await fs.mkdir(dir, { recursive: true });

  let name = `${input.filenameBase}.png`;
  let counter = 1;
  while (await fileExists(path.join(dir, name))) {
    name = `${input.filenameBase}-${counter++}.png`;
  }

  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, Buffer.from(input.imageBase64, "base64"));

  const logEntry = {
    timestamp: new Date().toISOString(),
    file: name,
    filePath,
    presetId: input.preset.id,
    sku: input.sku ?? null,
    productName: input.productName ?? null,
    prompt: input.promptUsed ?? null,
  };
  await fs.appendFile(path.join(dir, "log.jsonl"), JSON.stringify(logEntry) + "\n");

  return { filePath };
}
