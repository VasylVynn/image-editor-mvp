# Catalog Image Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the image tool into a Gemini-powered catalog photo workflow: analyze → generate → compare → save locally with proper names.

**Architecture:** Next.js (App Router) app running locally. Server modules in `src/lib/` (analyzer, prompt-builder, generator, storage, presets, product-fetcher) orchestrated by two API routes (`/api/process`, `/api/save`, later `/api/fetch-product`). Single-screen Ukrainian UI: upload or URL → process → side-by-side compare → save to a preset folder.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, `@google/genai` (Gemini API), `cheerio` (Phase 2 scraping), `vitest` (unit tests).

**Spec:** `docs/superpowers/specs/2026-08-14-catalog-image-workflow-design.md`

## Global Constraints

- UI copy is Ukrainian; code, comments, commits are English.
- Generation model: `gemini-3-pro-image-preview` (Nano Banana Pro). Analyzer model: `gemini-2.5-flash`.
- One env var: `GEMINI_API_KEY` in `.env.local` (the user adds it manually; never commit keys).
- Upload limits: PNG/JPEG/WebP, max 10 MB per file.
- Default preset: 940×1300, background `#E9E9E9`, aspect ratio `3:4`, output folder `~/CatalogPhotos/default`.
- No deterministic pixel post-processing (no sharp). Approximate output size/color is by design.
- Reference image and analysis step are optional; analysis failure must not block generation.
- Tests: vitest, colocated `*.test.ts` next to sources. Run with `npm test`.
- Server code may use Node `fs` (local deployment); keep all fs access inside `storage.ts` so a future hosted version swaps one module.

---

### Task 1: Remove old pipeline, add new dependencies and test harness

**Files:**
- Delete: `src/lib/image-processor.ts`, `src/lib/openai-processor.ts`, `src/lib/fal-processor.ts`, `src/lib/replicate-processor.ts`, `src/app/api/process-image/route.ts`
- Modify: `package.json`, `eslint.config.mjs`, `next.config.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: clean dependency set (`@google/genai`, `cheerio`, dev `vitest`), `npm test` script, `@` alias working in tests, lint override for test files.

- [ ] **Step 1: Delete old processors and route**

```bash
rm src/lib/image-processor.ts src/lib/openai-processor.ts src/lib/fal-processor.ts src/lib/replicate-processor.ts
rm -r src/app/api/process-image
```

- [ ] **Step 2: Swap dependencies**

```bash
npm uninstall sharp @imgly/background-removal-node openai replicate @fal-ai/client
npm install @google/genai cheerio
npm install -D vitest
```

- [ ] **Step 3: Add test script, vitest config and lint override for tests**

In `package.json` scripts add: `"test": "vitest run", "test:watch": "vitest"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

In `eslint.config.mjs` append an override to the exported config array (test snippets in later tasks use `any[]` for captured request objects; `@typescript-eslint/no-explicit-any` is error-level in eslint-config-next/typescript):

```js
{
  files: ["src/**/*.test.ts"],
  rules: { "@typescript-eslint/no-explicit-any": "off" },
},
```

- [ ] **Step 4: Clean next.config.ts**

Remove the now-stale bits: `serverExternalPackages: ["sharp", "@imgly/background-removal-node"]` (packages uninstalled in Step 2) and the `experimental.serverActions` block (no Server Actions in this app). Leave the rest of the config untouched.

- [ ] **Step 5: Verify build, lint and test runner**

Run: `npm run build` — Expected: PASS (page.tsx still compiles; it only references the old endpoint as a string).
Run: `npm run lint` — Expected: PASS.
Run: `npm test` — Expected: "No test files found" exit code 0 (vitest `passWithNoTests` not set — if it exits 1, add `passWithNoTests: true` to the `test` block).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove old processing pipeline, add @google/genai and vitest"
```

---

### Task 2: Presets module

**Files:**
- Create: `src/config/presets.json`, `src/lib/presets.ts`
- Test: `src/lib/presets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Preset { id: string; name: string; width: number; height: number; background: string; aspectRatio: string; outputDir: string }`
  - `listPresets(): Preset[]`
  - `getPreset(id: string): Preset` (throws on unknown id)
  - `resolveOutputDir(preset: Preset): string` (expands leading `~`)

- [ ] **Step 1: Write failing tests**

`src/lib/presets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import os from "os";
import { listPresets, getPreset, resolveOutputDir } from "./presets";

describe("presets", () => {
  it("lists at least the default preset", () => {
    const presets = listPresets();
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.map((p) => p.id)).toContain("default");
  });

  it("default preset matches the store requirements", () => {
    const p = getPreset("default");
    expect(p.width).toBe(940);
    expect(p.height).toBe(1300);
    expect(p.background).toBe("#E9E9E9");
    expect(p.aspectRatio).toBe("3:4");
  });

  it("throws on unknown preset id", () => {
    expect(() => getPreset("nope")).toThrow(/Unknown preset/);
  });

  it("expands ~ in outputDir", () => {
    const p = getPreset("default");
    const dir = resolveOutputDir(p);
    expect(dir.startsWith(os.homedir())).toBe(true);
    expect(dir).not.toContain("~");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- src/lib/presets.test.ts`
Expected: FAIL — cannot resolve `./presets`.

- [ ] **Step 3: Implement**

`src/config/presets.json`:

```json
{
  "presets": [
    {
      "id": "default",
      "name": "Основний магазин",
      "width": 940,
      "height": 1300,
      "background": "#E9E9E9",
      "aspectRatio": "3:4",
      "outputDir": "~/CatalogPhotos/default"
    }
  ]
}
```

`src/lib/presets.ts`:

```ts
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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- src/lib/presets.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/presets.json src/lib/presets.ts src/lib/presets.test.ts
git commit -m "feat: add per-store presets module"
```

---

### Task 3: Prompt builder

**Files:**
- Create: `src/lib/prompt-builder.ts`
- Test: `src/lib/prompt-builder.test.ts`

**Interfaces:**
- Consumes: `Preset` from `@/lib/presets`.
- Produces: `buildPrompt(input: { preset: Preset; analysis?: string; note?: string }): string`

- [ ] **Step 1: Write failing tests**

`src/lib/prompt-builder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPrompt } from "./prompt-builder";
import { getPreset } from "./presets";

const preset = getPreset("default");

describe("buildPrompt", () => {
  it("includes background, size and preservation rules", () => {
    const p = buildPrompt({ preset });
    expect(p).toContain("#E9E9E9");
    expect(p).toContain("940");
    expect(p).toContain("1300");
    expect(p.toLowerCase()).toContain("do not change the product");
  });

  it("appends analysis fragment when provided", () => {
    const p = buildPrompt({ preset, analysis: "4 wooden buttons" });
    expect(p).toContain("4 wooden buttons");
  });

  it("omits analysis section when not provided", () => {
    const p = buildPrompt({ preset });
    expect(p).not.toContain("observed details");
  });

  it("appends operator note when provided, skips blank note", () => {
    expect(buildPrompt({ preset, note: "прибери вішак" })).toContain("прибери вішак");
    expect(buildPrompt({ preset, note: "   " })).not.toContain("operator instruction");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- src/lib/prompt-builder.test.ts`
Expected: FAIL — cannot resolve `./prompt-builder`.

- [ ] **Step 3: Implement**

`src/lib/prompt-builder.ts`:

```ts
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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- src/lib/prompt-builder.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompt-builder.ts src/lib/prompt-builder.test.ts
git commit -m "feat: add catalog prompt builder"
```

---

### Task 4: Filename resolution (transliterated slugs)

**Files:**
- Create: `src/lib/naming.ts`
- Test: `src/lib/naming.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `slugify(text: string): string`
  - `resolveFilename(opts: { sku?: string; productName?: string }): string` (SKU wins; throws if both missing/blank)

- [ ] **Step 1: Write failing tests**

`src/lib/naming.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify, resolveFilename } from "./naming";

describe("slugify", () => {
  it("transliterates Ukrainian", () => {
    expect(slugify("Комплект боді і штанці")).toBe("komplekt-bodi-i-shtantsi");
  });

  it("handles specific Ukrainian letters", () => {
    expect(slugify("Ґудзик їжак є й")).toBe("gudzyk-izhak-ie-i");
  });

  it("collapses punctuation and spaces into single dashes", () => {
    expect(slugify("  Боді — «Ведмедик», 2 шт.  ")).toBe("bodi-vedmedyk-2-sht");
  });
});

describe("resolveFilename", () => {
  it("prefers SKU over product name", () => {
    expect(resolveFilename({ sku: "AB-123", productName: "Боді" })).toBe("ab-123");
  });

  it("falls back to product name", () => {
    expect(resolveFilename({ productName: "Боді синє" })).toBe("bodi-synie");
  });

  it("throws when both are missing or blank", () => {
    expect(() => resolveFilename({})).toThrow();
    expect(() => resolveFilename({ sku: "  " })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- src/lib/naming.test.ts`
Expected: FAIL — cannot resolve `./naming`.

- [ ] **Step 3: Implement**

`src/lib/naming.ts`:

```ts
// Ukrainian national transliteration (KMU 2010), lowercase, position-independent variant.
const UA_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie",
  ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "",
  ю: "iu", я: "ia", "'": "", "’": "",
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => UA_MAP[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveFilename(opts: { sku?: string; productName?: string }): string {
  const base = opts.sku?.trim() || opts.productName?.trim();
  // User-surfaced via the /api/save error handler — Ukrainian.
  if (!base) throw new Error("Вкажіть артикул або назву товару для імені файлу");
  const slug = slugify(base);
  if (!slug) throw new Error("З цієї назви не виходить коректне ім'я файлу");
  return slug;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- src/lib/naming.test.ts`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/naming.ts src/lib/naming.test.ts
git commit -m "feat: add transliterated filename resolution"
```

---

### Task 5: Storage (save PNG + JSONL log)

**Files:**
- Create: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: `Preset`, `resolveOutputDir` from `@/lib/presets`.
- Produces: `saveResult(input: { imageBase64: string; filenameBase: string; preset: Preset; promptUsed?: string; sku?: string; productName?: string }, outputDirOverride?: string): Promise<{ filePath: string }>`
  - Creates the folder if missing, avoids collisions with `-1`, `-2` suffixes, appends a line to `log.jsonl` in the same folder.
  - Log entry records the spec's "inputs + output path": `{ timestamp, file, filePath, presetId, sku, productName, prompt }`.
  - `outputDirOverride` exists for tests; production callers omit it.

- [ ] **Step 1: Write failing tests**

`src/lib/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { saveResult } from "./storage";
import { getPreset } from "./presets";

const preset = getPreset("default");
const PNG_BASE64 = Buffer.from("fake-png-bytes").toString("base64");

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
});

describe("saveResult", () => {
  it("writes <slug>.png into the folder", async () => {
    const { filePath } = await saveResult(
      { imageBase64: PNG_BASE64, filenameBase: "ab-123", preset },
      dir
    );
    expect(filePath).toBe(path.join(dir, "ab-123.png"));
    const written = await fs.readFile(filePath);
    expect(written.toString()).toBe("fake-png-bytes");
  });

  it("adds numeric suffix on collision", async () => {
    await saveResult({ imageBase64: PNG_BASE64, filenameBase: "ab-123", preset }, dir);
    const second = await saveResult({ imageBase64: PNG_BASE64, filenameBase: "ab-123", preset }, dir);
    expect(second.filePath).toBe(path.join(dir, "ab-123-1.png"));
  });

  it("appends a JSONL log entry with inputs and output path", async () => {
    await saveResult(
      {
        imageBase64: PNG_BASE64,
        filenameBase: "ab-123",
        preset,
        promptUsed: "the prompt",
        sku: "AB-123",
        productName: "Боді",
      },
      dir
    );
    const log = await fs.readFile(path.join(dir, "log.jsonl"), "utf8");
    const entry = JSON.parse(log.trim().split("\n")[0]);
    expect(entry.file).toBe("ab-123.png");
    expect(entry.filePath).toBe(path.join(dir, "ab-123.png"));
    expect(entry.prompt).toBe("the prompt");
    expect(entry.sku).toBe("AB-123");
    expect(entry.productName).toBe("Боді");
    expect(entry.timestamp).toBeTruthy();
  });

  it("creates missing nested folders", async () => {
    const nested = path.join(dir, "a", "b");
    const { filePath } = await saveResult(
      { imageBase64: PNG_BASE64, filenameBase: "x", preset },
      nested
    );
    expect(filePath).toBe(path.join(nested, "x.png"));
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- src/lib/storage.test.ts`
Expected: FAIL — cannot resolve `./storage`.

- [ ] **Step 3: Implement**

`src/lib/storage.ts`:

```ts
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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- src/lib/storage.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat: add local file storage with collision handling and JSONL log"
```

---

### Task 6: Shared types, Gemini client, analyzer

**Files:**
- Create: `src/lib/types.ts`, `src/lib/genai-client.ts`, `src/lib/analyzer.ts`
- Test: `src/lib/analyzer.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface ImageInput { data: string; mimeType: string }` (base64 payload) in `types.ts`
  - `interface AnalysisResult { itemCount: number; items: string[]; criticalDetails: string[] }` in `types.ts`
  - `getGenAI(): GoogleGenAI` in `genai-client.ts` (throws a clear error when `GEMINI_API_KEY` is missing)
  - `analyzeImages(images: ImageInput[], deps?): Promise<AnalysisResult>` and `formatAnalysis(a: AnalysisResult): string` in `analyzer.ts`
  - `deps` parameter shape (used by every Gemini-calling module for testability): `{ genAI: () => GoogleGenAI }`, defaulting to `{ genAI: getGenAI }`.

- [ ] **Step 1: Write failing tests**

`src/lib/analyzer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { analyzeImages, formatAnalysis, ANALYZER_MODEL } from "./analyzer";
import type { AnalysisResult } from "./types";

const IMG = { data: "aGVsbG8=", mimeType: "image/png" };

function fakeAI(responseText: string | undefined, calls: unknown[]) {
  return {
    models: {
      generateContent: async (req: unknown) => {
        calls.push(req);
        return { text: responseText };
      },
    },
  } as never;
}

describe("analyzeImages", () => {
  const stub: AnalysisResult = {
    itemCount: 2,
    items: ["bodysuit", "pants"],
    criticalDetails: ["4 wooden buttons", "bear print on chest"],
  };

  it("sends images plus instruction and parses JSON response", async () => {
    const calls: any[] = [];
    const result = await analyzeImages([IMG, IMG], { genAI: () => fakeAI(JSON.stringify(stub), calls) });
    expect(result).toEqual(stub);
    const req = calls[0];
    expect(req.model).toBe(ANALYZER_MODEL);
    const parts = req.contents[0].parts;
    expect(parts).toHaveLength(3); // 2 images + 1 text
    expect(parts[0].inlineData.data).toBe(IMG.data);
    expect(parts[2].text).toBeTruthy();
    expect(req.config.responseMimeType).toBe("application/json");
  });

  it("throws when model returns no text", async () => {
    await expect(
      analyzeImages([IMG], { genAI: () => fakeAI(undefined, []) })
    ).rejects.toThrow(/no text/i);
  });
});

describe("formatAnalysis", () => {
  it("renders item count, items and details as a prompt fragment", () => {
    const text = formatAnalysis({
      itemCount: 2,
      items: ["bodysuit", "pants"],
      criticalDetails: ["4 wooden buttons"],
    });
    expect(text).toContain("2 piece(s)");
    expect(text).toContain("bodysuit, pants");
    expect(text).toContain("- 4 wooden buttons");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- src/lib/analyzer.test.ts`
Expected: FAIL — cannot resolve `./analyzer`.

- [ ] **Step 3: Implement**

`src/lib/types.ts`:

```ts
export interface ImageInput {
  /** base64-encoded image bytes (no data: prefix) */
  data: string;
  mimeType: string;
}

export interface AnalysisResult {
  itemCount: number;
  items: string[];
  criticalDetails: string[];
}
```

`src/lib/genai-client.ts`:

```ts
import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    // User-surfaced via route error handlers — Ukrainian.
    throw new Error("GEMINI_API_KEY не налаштовано. Додайте його у .env.local");
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export interface GenAIDeps {
  genAI: () => GoogleGenAI;
}
```

`src/lib/analyzer.ts`:

```ts
import { Type } from "@google/genai";
import { getGenAI, type GenAIDeps } from "./genai-client";
import type { AnalysisResult, ImageInput } from "./types";

export const ANALYZER_MODEL = "gemini-2.5-flash";

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    itemCount: { type: Type.INTEGER },
    items: { type: Type.ARRAY, items: { type: Type.STRING } },
    criticalDetails: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["itemCount", "items", "criticalDetails"],
};

const ANALYZER_PROMPT =
  "You are writing preservation notes for an image editing model. The photo(s) show one " +
  "children's clothing product (possibly a multi-piece set). Report: itemCount — how many " +
  "garment pieces belong to the product; items — a short name for each piece; " +
  "criticalDetails — every visual detail that must survive editing unchanged: prints and " +
  "their exact placement, logos, text, buttons (count, material), zippers, laces, pockets, " +
  "collar type, fabric texture, exact colors. Be specific and concise.";

export async function analyzeImages(
  images: ImageInput[],
  deps: GenAIDeps = { genAI: getGenAI }
): Promise<AnalysisResult> {
  const ai = deps.genAI();
  const response = await ai.models.generateContent({
    model: ANALYZER_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          ...images.map((img) => ({
            inlineData: { data: img.data, mimeType: img.mimeType },
          })),
          { text: ANALYZER_PROMPT },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: ANALYSIS_SCHEMA,
    },
  });
  const text = response.text;
  if (!text) throw new Error("Analyzer returned no text");
  return JSON.parse(text) as AnalysisResult;
}

export function formatAnalysis(a: AnalysisResult): string {
  const itemsLine = `The product consists of ${a.itemCount} piece(s): ${a.items.join(", ")}.`;
  const details = a.criticalDetails.map((d) => `- ${d}`).join("\n");
  return `${itemsLine}\nDetails that must remain exactly as in the original:\n${details}`;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- src/lib/analyzer.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/genai-client.ts src/lib/analyzer.ts src/lib/analyzer.test.ts
git commit -m "feat: add Gemini client and product detail analyzer"
```

---

### Task 7: Generator (Nano Banana Pro)

**Files:**
- Create: `src/lib/generator.ts`
- Test: `src/lib/generator.test.ts`

**Interfaces:**
- Consumes: `ImageInput` from `@/lib/types`, `getGenAI`/`GenAIDeps` from `@/lib/genai-client`.
- Produces: `generateImage(input: { mainImage: ImageInput; referenceImage?: ImageInput; prompt: string; aspectRatio: string }, deps?): Promise<ImageInput>`

- [ ] **Step 1: Write failing tests**

`src/lib/generator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateImage, GENERATION_MODEL } from "./generator";

const MAIN = { data: "bWFpbg==", mimeType: "image/jpeg" };
const REF = { data: "cmVm", mimeType: "image/png" };

function fakeAI(parts: unknown[], calls: unknown[]) {
  return {
    models: {
      generateContent: async (req: unknown) => {
        calls.push(req);
        return { candidates: [{ content: { parts } }] };
      },
    },
  } as never;
}

describe("generateImage", () => {
  it("sends main image, prompt and image config", async () => {
    const calls: any[] = [];
    const out = await generateImage(
      { mainImage: MAIN, prompt: "edit it", aspectRatio: "3:4" },
      { genAI: () => fakeAI([{ inlineData: { data: "cmVzdWx0", mimeType: "image/png" } }], calls) }
    );
    expect(out).toEqual({ data: "cmVzdWx0", mimeType: "image/png" });
    const req = calls[0];
    expect(req.model).toBe(GENERATION_MODEL);
    const parts = req.contents[0].parts;
    expect(parts).toHaveLength(2); // main + text
    expect(parts[1].text).toBe("edit it");
    expect(req.config.imageConfig.aspectRatio).toBe("3:4");
    expect(req.config.responseModalities).toContain("IMAGE");
  });

  it("includes reference image between main and prompt when provided", async () => {
    const calls: any[] = [];
    await generateImage(
      { mainImage: MAIN, referenceImage: REF, prompt: "edit", aspectRatio: "3:4" },
      { genAI: () => fakeAI([{ inlineData: { data: "eA==", mimeType: "image/png" } }], calls) }
    );
    const parts = calls[0].contents[0].parts;
    expect(parts).toHaveLength(3);
    expect(parts[1].inlineData.data).toBe(REF.data);
  });

  it("throws with model text when no image comes back", async () => {
    await expect(
      generateImage(
        { mainImage: MAIN, prompt: "edit", aspectRatio: "3:4" },
        { genAI: () => fakeAI([{ text: "I cannot do that" }], []) }
      )
    ).rejects.toThrow(/I cannot do that/);
  });

  it("defaults mimeType to image/png when missing", async () => {
    const out = await generateImage(
      { mainImage: MAIN, prompt: "edit", aspectRatio: "3:4" },
      { genAI: () => fakeAI([{ inlineData: { data: "eQ==" } }], []) }
    );
    expect(out.mimeType).toBe("image/png");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- src/lib/generator.test.ts`
Expected: FAIL — cannot resolve `./generator`.

- [ ] **Step 3: Implement**

`src/lib/generator.ts`:

```ts
import { getGenAI, type GenAIDeps } from "./genai-client";
import type { ImageInput } from "./types";

export const GENERATION_MODEL = "gemini-3-pro-image-preview";

export interface GenerateInput {
  mainImage: ImageInput;
  referenceImage?: ImageInput;
  prompt: string;
  aspectRatio: string;
}

export async function generateImage(
  input: GenerateInput,
  deps: GenAIDeps = { genAI: getGenAI }
): Promise<ImageInput> {
  const ai = deps.genAI();
  const parts = [
    { inlineData: { data: input.mainImage.data, mimeType: input.mainImage.mimeType } },
    ...(input.referenceImage
      ? [{ inlineData: { data: input.referenceImage.data, mimeType: input.referenceImage.mimeType } }]
      : []),
    { text: input.prompt },
  ];

  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
      imageConfig: { aspectRatio: input.aspectRatio, imageSize: "2K" },
    },
  });

  const outParts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = outParts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const modelText = outParts.find((p) => p.text)?.text;
    // User-surfaced via the /api/process error handler — Ukrainian prefix, raw model text appended.
    throw new Error(`Модель не повернула зображення${modelText ? `: ${modelText}` : ""}`);
  }
  return {
    data: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType ?? "image/png",
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- src/lib/generator.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generator.ts src/lib/generator.test.ts
git commit -m "feat: add Nano Banana Pro image generator"
```

---

### Task 8: `/api/process` route

**Files:**
- Create: `src/app/api/process/route.ts`
- Test: `src/app/api/process/route.test.ts`

**Interfaces:**
- Consumes: `analyzeImages`, `formatAnalysis` (`@/lib/analyzer`), `generateImage` (`@/lib/generator`), `buildPrompt` (`@/lib/prompt-builder`), `getPreset` (`@/lib/presets`), `ImageInput` (`@/lib/types`).
- Produces: `POST /api/process` — multipart form fields:
  - `image` (File, required), `reference` (File, optional), `note` (string, optional), `presetId` (string, default `"default"`), `analyze` (`"true"`/`"false"`, default `"true"`)
  - 200 response JSON: `{ image: string /* data URL */, promptUsed: string, analysis: string | null, analysisFailed: boolean }`
  - 400 on missing/invalid file, 413 on oversize, 500 with `{ error }` on processing failure.

- [ ] **Step 1: Write failing tests**

`src/app/api/process/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/generator", () => ({
  generateImage: vi.fn(async () => ({ data: "cmVzdWx0", mimeType: "image/png" })),
}));
vi.mock("@/lib/analyzer", () => ({
  analyzeImages: vi.fn(async () => ({
    itemCount: 1,
    items: ["dress"],
    criticalDetails: ["bow on collar"],
  })),
  formatAnalysis: vi.fn(() => "FORMATTED ANALYSIS"),
}));

import { POST } from "./route";
import { generateImage } from "@/lib/generator";
import { analyzeImages } from "@/lib/analyzer";

function makeRequest(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request("http://localhost/api/process", { method: "POST", body: fd });
}

const pngFile = () => new File([Buffer.from("img")], "a.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/process", () => {
  it("400 when image is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("400 on disallowed mime type", async () => {
    const bad = new File([Buffer.from("x")], "a.gif", { type: "image/gif" });
    const res = await POST(makeRequest({ image: bad }));
    expect(res.status).toBe(400);
  });

  it("413 on oversize file", async () => {
    const big = new File([Buffer.alloc(11 * 1024 * 1024)], "a.png", { type: "image/png" });
    const res = await POST(makeRequest({ image: big }));
    expect(res.status).toBe(413);
  });

  it("returns data URL and prompt containing analysis", async () => {
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.image).toBe("data:image/png;base64,cmVzdWx0");
    expect(body.analysis).toBe("FORMATTED ANALYSIS");
    expect(body.analysisFailed).toBe(false);
    expect(body.promptUsed).toContain("FORMATTED ANALYSIS");
  });

  it("skips analysis when analyze=false", async () => {
    const res = await POST(makeRequest({ image: pngFile(), analyze: "false" }));
    expect(res.status).toBe(200);
    expect(analyzeImages).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.analysis).toBeNull();
  });

  it("falls back to base prompt when analysis fails", async () => {
    vi.mocked(analyzeImages).mockRejectedValueOnce(new Error("boom"));
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysisFailed).toBe(true);
    expect(body.analysis).toBeNull();
  });

  it("passes reference image to generator", async () => {
    const res = await POST(makeRequest({ image: pngFile(), reference: pngFile() }));
    expect(res.status).toBe(200);
    const arg = vi.mocked(generateImage).mock.calls[0][0];
    expect(arg.referenceImage).toBeTruthy();
  });

  it("500 with error message when generation fails", async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error("model down"));
    const res = await POST(makeRequest({ image: pngFile() }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("model down");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- src/app/api/process/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement**

`src/app/api/process/route.ts`:

```ts
import { NextResponse } from "next/server";
import { analyzeImages, formatAnalysis } from "@/lib/analyzer";
import { generateImage } from "@/lib/generator";
import { buildPrompt } from "@/lib/prompt-builder";
import { getPreset } from "@/lib/presets";
import type { ImageInput } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

async function toImageInput(file: File): Promise<ImageInput> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return { data: buffer.toString("base64"), mimeType: file.type };
}

function validateFile(file: File, label: string): NextResponse | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `${label}: невірний тип файлу. Дозволені: PNG, JPG, WebP` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `${label}: файл завеликий. Максимум 10МБ` },
      { status: 413 }
    );
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    const referenceFile = formData.get("reference") as File | null;
    const note = (formData.get("note") as string) || undefined;
    const presetId = (formData.get("presetId") as string) || "default";
    const analyze = (formData.get("analyze") as string) !== "false";

    if (!file) {
      return NextResponse.json({ error: "Не надано зображення" }, { status: 400 });
    }
    const fileError = validateFile(file, "Основне фото");
    if (fileError) return fileError;
    if (referenceFile) {
      const refError = validateFile(referenceFile, "Референс");
      if (refError) return refError;
    }

    const preset = getPreset(presetId);
    const mainImage = await toImageInput(file);
    const referenceImage = referenceFile ? await toImageInput(referenceFile) : undefined;

    let analysis: string | null = null;
    let analysisFailed = false;
    if (analyze) {
      try {
        const images = referenceImage ? [mainImage, referenceImage] : [mainImage];
        analysis = formatAnalysis(await analyzeImages(images));
      } catch (err) {
        console.error("Analysis failed, falling back to base prompt:", err);
        analysisFailed = true;
      }
    }

    const prompt = buildPrompt({ preset, analysis: analysis ?? undefined, note });
    const result = await generateImage({
      mainImage,
      referenceImage,
      prompt,
      aspectRatio: preset.aspectRatio,
    });

    return NextResponse.json({
      image: `data:${result.mimeType};base64,${result.data}`,
      promptUsed: prompt,
      analysis,
      analysisFailed,
    });
  } catch (error) {
    console.error("Processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Помилка обробки" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- src/app/api/process/route.test.ts`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/process
git commit -m "feat: add /api/process route orchestrating analyze and generate"
```

---

### Task 9: `/api/save` route

**Files:**
- Create: `src/app/api/save/route.ts`
- Test: `src/app/api/save/route.test.ts`

**Interfaces:**
- Consumes: `saveResult` (`@/lib/storage`), `resolveFilename` (`@/lib/naming`), `getPreset` (`@/lib/presets`).
- Produces: `POST /api/save` — JSON body `{ image: string /* data URL or bare base64 */, sku?: string, productName?: string, presetId?: string, promptUsed?: string }`
  - 200: `{ path: string }` (absolute saved file path)
  - 400 on missing image or missing both sku/productName; 500 with `{ error }` otherwise.

- [ ] **Step 1: Write failing tests**

`src/app/api/save/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage", () => ({
  saveResult: vi.fn(async () => ({ filePath: "/tmp/out/ab-123.png" })),
}));

import { POST } from "./route";
import { saveResult } from "@/lib/storage";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/save", () => {
  it("400 when image missing", async () => {
    const res = await POST(makeRequest({ sku: "AB-1" }));
    expect(res.status).toBe(400);
  });

  it("400 when no sku and no product name", async () => {
    const res = await POST(makeRequest({ image: "aGk=" }));
    expect(res.status).toBe(400);
  });

  it("saves with slugged sku and strips data URL prefix", async () => {
    const res = await POST(
      makeRequest({ image: "data:image/png;base64,aGk=", sku: "AB 123", promptUsed: "p" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe("/tmp/out/ab-123.png");
    const arg = vi.mocked(saveResult).mock.calls[0][0];
    expect(arg.imageBase64).toBe("aGk=");
    expect(arg.filenameBase).toBe("ab-123");
    expect(arg.promptUsed).toBe("p");
    expect(arg.sku).toBe("AB 123"); // raw inputs travel to the log
  });

  it("500 with error when storage fails", async () => {
    vi.mocked(saveResult).mockRejectedValueOnce(new Error("disk full"));
    const res = await POST(makeRequest({ image: "aGk=", productName: "Боді" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("disk full");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- src/app/api/save/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement**

`src/app/api/save/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getPreset } from "@/lib/presets";
import { resolveFilename } from "@/lib/naming";
import { saveResult } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { image, sku, productName, presetId, promptUsed } = body as {
      image?: string;
      sku?: string;
      productName?: string;
      presetId?: string;
      promptUsed?: string;
    };

    if (!image) {
      return NextResponse.json({ error: "Немає зображення для збереження" }, { status: 400 });
    }
    if (!sku?.trim() && !productName?.trim()) {
      return NextResponse.json(
        { error: "Вкажіть артикул або назву товару" },
        { status: 400 }
      );
    }

    const preset = getPreset(presetId || "default");
    const filenameBase = resolveFilename({ sku, productName });
    const imageBase64 = image.startsWith("data:")
      ? image.slice(image.indexOf(",") + 1)
      : image;

    const { filePath } = await saveResult({
      imageBase64,
      filenameBase,
      preset,
      promptUsed,
      sku,
      productName,
    });
    return NextResponse.json({ path: filePath });
  } catch (error) {
    console.error("Save error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Помилка збереження" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- src/app/api/save/route.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/save
git commit -m "feat: add /api/save route writing named files to preset folder"
```

---

### Task 10: UI — upload and process flow

**Files:**
- Create: `src/components/UploadPanel.tsx`
- Modify: `src/app/page.tsx` (full rewrite), `src/components/ProcessingStatus.tsx` (simplify)
- Delete: `src/components/ImageUploader.tsx` (replaced by UploadPanel), `src/components/DownloadButton.tsx`, `src/components/ImagePreview.tsx` (orphaned; CompareView in Task 11 replaces it)

**Interfaces:**
- Consumes: `POST /api/process` contract from Task 8; `listPresets()` values serialized into the page via a small `GET /api/presets`-free approach — import `listPresets` directly in a server component wrapper is NOT possible (page is a client component), so hardcode fetch of presets is avoided: `page.tsx` imports preset list from a tiny client-safe module (`src/config/presets.json` is imported directly — it contains no secrets).
- Produces: working screen: upload 1–2 photos → mark main/reference → note field, preset select, analysis toggle → «Обробити» → result appears in state (compare view arrives in Task 11; until then show the raw result image under the originals).

`UploadPanel` props contract (Task 11 and 13 reuse it):

```ts
interface UploadPanelProps {
  onImagesChange: (main: File | null, reference: File | null) => void;
  disabled: boolean;
}
```

- [ ] **Step 1: Implement UploadPanel**

`src/components/UploadPanel.tsx` — client component:
- Drag-and-drop zone + file input, `accept="image/png,image/jpeg,image/webp"`, `multiple`, max 2 files.
- Shows thumbnails of the selected files via `URL.createObjectURL`.
- When 2 files present: each thumbnail has a badge button toggling which one is «Основне» (the other becomes «Референс»); default: first = main.
- «Прибрати» button per thumbnail.
- Calls `onImagesChange(main, reference)` on every change (`reference` null when only one file).
- All labels Ukrainian: «Перетягніть 1–2 фото або натисніть», «Основне», «Референс», «Прибрати».

- [ ] **Step 2: Rewrite page.tsx**

`src/app/page.tsx` — client component with state:

```ts
type Stage = "idle" | "processing" | "done";
const [mainFile, setMainFile] = useState<File | null>(null);
const [refFile, setRefFile] = useState<File | null>(null);
const [note, setNote] = useState("");
const [presetId, setPresetId] = useState("default");
const [analyze, setAnalyze] = useState(true);
const [stage, setStage] = useState<Stage>("idle");
const [result, setResult] = useState<{ image: string; promptUsed: string; analysis: string | null; analysisFailed: boolean } | null>(null);
const [error, setError] = useState<string | null>(null);
```

- Header: «Каталог: обробка фото товарів» + subtitle.
- Controls row: preset `<select>` (options from `presets.json` import: `import presetsConfig from "@/config/presets.json"`), analysis toggle checkbox «Аналіз деталей», note `<input>` placeholder «Примітка (необовʼязково): напр. прибери вішак».
- `handleProcess`: builds `FormData` (`image`, `reference` if set, `note`, `presetId`, `analyze`), POSTs `/api/process`, on ok → `setResult(json)`, `setStage("done")`; on error → show `error` box with message + button «Спробувати ще» (re-runs `handleProcess`; the full pipeline including analysis re-runs — analysis cost is negligible, and inputs are kept, which satisfies the spec's retry intent).
- While `stage === "processing"`: render `ProcessingStatus`.
- When `result` set: show `result.image` in an `<img>` under the upload area (temporary until Task 11), plus notice «Аналіз не спрацював, використано базовий промпт» when `analysisFailed`.
- «Нове фото» button resets all state.
- Simplify `ProcessingStatus.tsx`: drop the `mode` prop; text «Обробляємо фото… (10–30 секунд)» with spinner.
- Delete `src/components/ImageUploader.tsx`, `src/components/DownloadButton.tsx` and `src/components/ImagePreview.tsx`.

- [ ] **Step 3: Verify build and manual smoke**

Run: `npm run build`
Expected: PASS, no type errors, no references to deleted components.

Run: `npm run dev`, open `http://localhost:3000` in a browser: upload two images, toggle main/reference, click «Обробити» — with `GEMINI_API_KEY` present expect a generated image; without the key expect the error box with the clear message. Screenshot the result state.

If `GEMINI_API_KEY` is not in `.env.local`, STOP and ask the user to add it before the live golden path; verify only the no-key error path meanwhile. If the API rejects the `gemini-3-pro-image-preview` model (tier/region), STOP and ask the user — do not silently substitute another model.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: rewrite UI with dual upload, note, preset and analysis controls"
```

---

### Task 11: UI — compare view, save form, regenerate

**Files:**
- Create: `src/components/CompareView.tsx`, `src/components/SaveForm.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `POST /api/save` contract from Task 9; page state from Task 10.
- Produces:

```ts
interface CompareViewProps {
  originalUrl: string;        // object URL of main file
  referenceUrl: string | null;
  resultImage: string;        // data URL from /api/process
}
interface SaveFormProps {
  resultImage: string;
  promptUsed: string;
  presetId: string;
  defaultSku: string;         // "" in Phase 1; product page SKU in Phase 2 (Task 13)
  defaultProductName: string; // main file name without extension; product title in Phase 2
  onSaved: (path: string) => void;
}
```

`defaultSku` / `defaultProductName` are initial values for the inputs (applied when the result changes); the operator can edit both.

- [ ] **Step 1: Implement CompareView**

`src/components/CompareView.tsx`:
- Two-column grid (stack on mobile): left «Оригінал» (originalUrl), right «Результат» (resultImage), equal-height cards, `object-contain`.
- If `referenceUrl`: small labeled thumbnail «Референс» under the original.

- [ ] **Step 2: Implement SaveForm**

`src/components/SaveForm.tsx`:
- Inputs: «Артикул (SKU)» (pre-filled with `defaultSku`) and «Назва товару» (pre-filled with `defaultProductName`), hint «Ім'я файлу = артикул, якщо вказано». In Phase 1 the page passes `defaultSku=""`.
- Button «Зберегти у папку» → POST `/api/save` with `{ image: resultImage, sku, productName, presetId, promptUsed }`.
- On success: green box «Збережено: <path>» via `onSaved(path)`; on error: red box with server message and the button re-enabled.
- Disable button while request in flight («Зберігаємо…»).

- [ ] **Step 3: Wire into page.tsx**

- When `stage === "done"`: render `CompareView` + action row: `SaveForm`, «Перегенерувати» (keeps files/preset/toggle, note stays editable → calls `handleProcess` again), «Нове фото» (full reset).
- Remove the temporary raw `<img>` block from Task 10.
- After save success also show the path notice near the top of the action area.

- [ ] **Step 4: Verify build + tests**

Run: `npm run build && npm test`
Expected: build PASS, all existing tests PASS.

- [ ] **Step 5: Manual verification (Chrome, live)**

Golden path with `GEMINI_API_KEY`: upload → process → compare view shows both images → enter SKU → save → file exists (`ls ~/CatalogPhotos/default/`) and `log.jsonl` has the entry. Edge case: click «Зберегти» with both fields empty → red validation message from server. Regenerate with an added note → new result replaces old. Screenshot compare view.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add compare view, save form and regenerate flow"
```

---

### Task 12: Product page fetcher (Phase 2 backend)

**Files:**
- Create: `src/lib/product-fetcher.ts`, `src/app/api/fetch-product/route.ts`
- Test: `src/lib/product-fetcher.test.ts`
- Modify: `src/app/api/process/route.ts` (accept image URLs), `src/app/api/process/route.test.ts`

**Interfaces:**
- Consumes: `ImageInput` from `@/lib/types`.
- Produces:
  - `interface ProductPage { title: string | null; sku: string | null; images: string[] }`
  - `fetchProductPage(url: string, deps?: { fetchFn: typeof fetch }): Promise<ProductPage>`
  - `downloadImage(url: string, deps?: { fetchFn: typeof fetch }): Promise<ImageInput>` (rejects non-image content types and >10 MB bodies)
  - `POST /api/fetch-product` — body `{ url: string }` → 200 `ProductPage`, 400 on invalid URL, 502 on fetch failure.
  - `/api/process` additionally accepts `imageUrl` / `referenceUrl` string fields as an alternative to the `image` / `reference` files (files win if both present).

- [ ] **Step 1: Write failing tests for the fetcher**

`src/lib/product-fetcher.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fetchProductPage, downloadImage } from "./product-fetcher";

const OG_STORE_HTML = `
<html><head>
  <title>Магазин — Комплект боді</title>
  <meta property="og:title" content="Комплект боді і штанці" />
  <meta property="og:image" content="https://cdn.shop.ua/img/main.jpg" />
</head><body>
  <div class="product-gallery">
    <img src="/img/1.jpg" /><img src="/img/2.jpg" />
    <img src="https://cdn.shop.ua/img/main.jpg" />
  </div>
  <span itemprop="sku">KB-042</span>
</body></html>`;

const PLAIN_STORE_HTML = `
<html><head><title>Боді синє | Дитячий одяг</title></head>
<body>
  <h1>Боді синє</h1>
  <table><tr><td>Артикул:</td><td>ART-7</td></tr></table>
  <div class="gallery"><img src="/photos/a.png" /></div>
</body></html>`;

function fakeFetch(body: string | ArrayBuffer, headers: Record<string, string> = {}) {
  return (async () =>
    new Response(body, { status: 200, headers })) as unknown as typeof fetch;
}

describe("fetchProductPage", () => {
  it("extracts og:title, og:image, gallery images and itemprop sku", async () => {
    const page = await fetchProductPage("https://shop.ua/p/1", {
      fetchFn: fakeFetch(OG_STORE_HTML, { "content-type": "text/html" }),
    });
    expect(page.title).toBe("Комплект боді і штанці");
    expect(page.sku).toBe("KB-042");
    expect(page.images[0]).toBe("https://cdn.shop.ua/img/main.jpg"); // og:image first
    expect(page.images).toContain("https://shop.ua/img/1.jpg"); // absolutized
    expect(new Set(page.images).size).toBe(page.images.length); // deduped
  });

  it("falls back to h1 title and label-based SKU", async () => {
    const page = await fetchProductPage("https://shop.ua/p/2", {
      fetchFn: fakeFetch(PLAIN_STORE_HTML, { "content-type": "text/html" }),
    });
    expect(page.title).toBe("Боді синє");
    expect(page.sku).toBe("ART-7");
    expect(page.images).toContain("https://shop.ua/photos/a.png");
  });

  it("rejects invalid URLs", async () => {
    await expect(fetchProductPage("not-a-url")).rejects.toThrow();
  });
});

describe("downloadImage", () => {
  it("returns base64 payload with mime type", async () => {
    const bytes = new TextEncoder().encode("imgbytes");
    const img = await downloadImage("https://cdn.shop.ua/i.jpg", {
      fetchFn: fakeFetch(bytes.buffer, { "content-type": "image/jpeg" }),
    });
    expect(img.mimeType).toBe("image/jpeg");
    expect(Buffer.from(img.data, "base64").toString()).toBe("imgbytes");
  });

  it("rejects non-image content type", async () => {
    await expect(
      downloadImage("https://cdn.shop.ua/i", {
        fetchFn: fakeFetch("<html>", { "content-type": "text/html" }),
      })
    ).rejects.toThrow(/не зображення/);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- src/lib/product-fetcher.test.ts`
Expected: FAIL — cannot resolve `./product-fetcher`.

- [ ] **Step 3: Implement the fetcher**

`src/lib/product-fetcher.ts`:

```ts
import * as cheerio from "cheerio";
import type { ImageInput } from "./types";

export interface ProductPage {
  title: string | null;
  sku: string | null;
  images: string[];
}

export interface FetchDeps {
  fetchFn: typeof fetch;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_GALLERY = 12;
const SKU_LABEL = /(артикул|sku|код товару)/i;

export async function fetchProductPage(
  url: string,
  deps: FetchDeps = { fetchFn: fetch }
): Promise<ProductPage> {
  const base = new URL(url); // throws on invalid URL
  const response = await deps.fetchFn(url, {
    headers: { "User-Agent": "Mozilla/5.0 (catalog-image-tool)" },
  });
  if (!response.ok) throw new Error(`Сторінка недоступна: HTTP ${response.status}`);
  const $ = cheerio.load(await response.text());

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").text().split("|")[0].split("—")[0].trim() ||
    null;

  let sku = $('[itemprop="sku"]').first().text().trim() || null;
  if (!sku) {
    sku = $('meta[property="product:retailer_item_id"]').attr("content")?.trim() || null;
  }
  if (!sku) {
    $("td, th, span, div, li, dt").each((_, el) => {
      if (sku) return;
      const text = $(el).text().trim();
      if (SKU_LABEL.test(text) && text.length < 40) {
        const next = $(el).next().text().trim();
        const inline = text.replace(SKU_LABEL, "").replace(/[:\s]+/g, " ").trim();
        sku = next || inline || null;
      }
    });
  }

  const urls: string[] = [];
  const push = (src: string | undefined) => {
    if (!src || src.startsWith("data:") || src.endsWith(".svg")) return;
    try {
      const abs = new URL(src, base).toString();
      if (!urls.includes(abs)) urls.push(abs);
    } catch {
      /* skip malformed */
    }
  };
  push($('meta[property="og:image"]').attr("content"));
  $('[class*="gallery"] img, [class*="product"] img, main img')
    .each((_, el) => push($(el).attr("src") ?? $(el).attr("data-src")));

  return { title, sku, images: urls.slice(0, MAX_GALLERY) };
}

export async function downloadImage(
  url: string,
  deps: FetchDeps = { fetchFn: fetch }
): Promise<ImageInput> {
  const response = await deps.fetchFn(url, {
    headers: { "User-Agent": "Mozilla/5.0 (catalog-image-tool)" },
  });
  if (!response.ok) throw new Error(`Не вдалося завантажити фото: HTTP ${response.status}`);
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
  // User-surfaced via route error handlers — Ukrainian.
  if (!mimeType.startsWith("image/")) {
    throw new Error(`За посиланням не зображення (content-type: ${mimeType || "невідомий"})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("Фото завелике (понад 10МБ)");
  return { data: buffer.toString("base64"), mimeType };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- src/lib/product-fetcher.test.ts`
Expected: 5 PASS. (If cheerio selector behavior differs on the label fallback, adjust the implementation — not the fixtures.)

- [ ] **Step 5: Add the route**

`src/app/api/fetch-product/route.ts`:

```ts
import { NextResponse } from "next/server";
import { fetchProductPage } from "@/lib/product-fetcher";

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url || !/^https?:\/\//.test(url)) {
      return NextResponse.json({ error: "Вкажіть коректне посилання (http/https)" }, { status: 400 });
    }
    const page = await fetchProductPage(url);
    if (page.images.length === 0) {
      return NextResponse.json(
        { error: "Не знайшли фото на сторінці. Спробуйте зберегти фото вручну." },
        { status: 502 }
      );
    }
    return NextResponse.json(page);
  } catch (error) {
    console.error("Fetch product error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не вдалося прочитати сторінку" },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 6: Extend `/api/process` with URL inputs**

In `src/app/api/process/route.ts`, after reading form fields add:

```ts
const imageUrl = (formData.get("imageUrl") as string) || undefined;
const referenceUrl = (formData.get("referenceUrl") as string) || undefined;
```

Replace the `if (!file)` guard and image-input construction with:

```ts
let mainImage: ImageInput;
if (file) {
  const fileError = validateFile(file, "Основне фото");
  if (fileError) return fileError;
  mainImage = await toImageInput(file);
} else if (imageUrl) {
  mainImage = await downloadImage(imageUrl);
} else {
  return NextResponse.json({ error: "Не надано зображення" }, { status: 400 });
}

let referenceImage: ImageInput | undefined;
if (referenceFile) {
  const refError = validateFile(referenceFile, "Референс");
  if (refError) return refError;
  referenceImage = await toImageInput(referenceFile);
} else if (referenceUrl) {
  referenceImage = await downloadImage(referenceUrl);
}
```

(import `downloadImage` from `@/lib/product-fetcher`).

Add to `src/app/api/process/route.test.ts`:

```ts
vi.mock("@/lib/product-fetcher", () => ({
  downloadImage: vi.fn(async () => ({ data: "ZnJvbVVybA==", mimeType: "image/jpeg" })),
}));
```

and two tests:

```ts
it("accepts imageUrl instead of file", async () => {
  const res = await POST(makeRequest({ imageUrl: "https://cdn.shop.ua/i.jpg" }));
  expect(res.status).toBe(200);
});

it("file wins over imageUrl when both present", async () => {
  const res = await POST(makeRequest({ image: pngFile(), imageUrl: "https://x/y.jpg" }));
  expect(res.status).toBe(200);
  const arg = vi.mocked(generateImage).mock.calls[0][0];
  expect(arg.mainImage.data).not.toBe("ZnJvbVVybA==");
});
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all PASS (including the two new route tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/product-fetcher.ts src/lib/product-fetcher.test.ts src/app/api/fetch-product src/app/api/process
git commit -m "feat: add product page fetcher and URL-based image inputs"
```

---

### Task 13: UI — product URL flow

**Files:**
- Create: `src/components/ProductUrlPanel.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `POST /api/fetch-product` (Task 12), `imageUrl`/`referenceUrl` fields of `/api/process` (Task 12), `SaveFormProps.defaultProductName` and SKU prefill (Task 11).
- Produces:

```ts
interface ProductUrlPanelProps {
  onProductLoaded: (product: {
    title: string | null;
    sku: string | null;
    images: string[];
  }) => void;
  disabled: boolean;
}
```

- [ ] **Step 1: Implement ProductUrlPanel**

- Input «Посилання на товар» + button «Знайти фото» → POST `/api/fetch-product`.
- Loading state on the button («Шукаємо…»); error box on failure with server message.
- On success calls `onProductLoaded(page)`.

- [ ] **Step 2: Wire gallery selection into page.tsx**

- New state: `productTitle`, `productSku`, `galleryImages: string[]`, `mainUrl: string | null`, `refUrl: string | null`.
- Tab-like switch above the input area: «Завантажити файли» / «З посилання».
- URL mode: after `onProductLoaded`, render the gallery as a grid of thumbnails (plain `<img src>` — cross-origin display is fine). Click cycles the state of a thumbnail: none → «Основне» → «Референс» → none (only one of each; picking a new «Основне» clears the previous one). Badges match UploadPanel styling.
- `handleProcess` in URL mode sends `imageUrl`/`referenceUrl` instead of files.
- «Обробити» is disabled until a main image exists (file mode: `mainFile`; URL mode: `mainUrl` marked «Основне»).
- `CompareView.originalUrl` in URL mode = `mainUrl`.
- `SaveForm` receives `defaultSku={productSku ?? ""}` and `defaultProductName={productTitle ?? ""}` — props defined in Task 11, no SaveForm changes needed here.
- «Нове фото» resets URL-mode state too.

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 4: Manual verification (Chrome, live)**

Ask the user for a real product URL from their store first (executors must not guess one). Paste it → gallery appears → pick main (+ reference) → process → compare → save; SKU/name prefilled from the page. Also verify a URL with no findable images shows the friendly error. Screenshot the gallery-selection state.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add product URL flow with gallery selection"
```

---

### Task 14: Final verification pass

**Files:**
- Modify: `README.md` (replace boilerplate)

**Interfaces:**
- Consumes: everything above.
- Produces: verified working tool + honest README.

- [ ] **Step 1: Full automated check**

Run: `npm run lint && npm run build && npm test`
Expected: all PASS, zero warnings that indicate real problems.

- [ ] **Step 2: Rewrite README**

Replace create-next-app boilerplate: what the tool does (UA, one paragraph), setup (`npm install`, `.env.local` with `GEMINI_API_KEY`, `npm run dev`), preset config (`src/config/presets.json` — how to add a store), where files are saved, cost note (~$0.13–0.16 per generation).

- [ ] **Step 3: Live golden-path walkthrough (Chrome)**

With the dev server running: full flow both modes (upload + URL), save both, check files and `log.jsonl` on disk, regenerate once with a note, trigger one error path (e.g. temporarily rename `GEMINI_API_KEY` → clear error + retry works). Screenshots of: compare view, saved confirmation, gallery selection.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for the catalog image workflow"
```
