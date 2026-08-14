# Catalog Image Workflow — Design

Date: 2026-08-14
Status: Approved (design review in chat)

## Problem

Operator (owner's wife) prepares product photos for a children's-clothes e-commerce catalog.
Current manual flow: save image(s) from a product page → paste into ChatGPT with a long
hand-written prompt → download result → rename → save to folder → upload to CRM.

Pain points:

1. **Quality.** ChatGPT (gpt-image) regenerates the garment: prints/logos distorted,
   small details (buttons, zippers, laces) lost or invented, shape/proportions drift
   (uneven sleeves, rearranged sets).
2. **Speed.** Every image is a manual copy-paste-rename cycle.

Goal: a local web tool that makes one operator faster and the output more faithful.
Future: scale the same tool to pitch other e-commerce stores (per-store presets).

## What processing means here

- Remove extras (hangers, hands, price tags, other items).
- Straighten / re-lay the garment (neat flat-lay look) — requires a generative edit model.
- Clean up visual noise; keep the product itself pixel-faithful.
- Catalog format: ~940 × 1300 px, background #E9E9E9, product centered.
  Approximate size/color from the model is acceptable (no deterministic post-processing —
  current ChatGPT-style background output already looks fine to the operator).

## Explicitly out of scope

- Uploading results to the CRM.
- Multiple generation candidates per run (single result, regenerate on demand).
- Automated QC / scoring of results (operator judges by eye in a compare view).
- Deterministic pixel post-processing (sharp/imgly pipeline is removed).
- Catalog-wide crawling (only single product URL in Phase 2).

## Decisions

| Topic | Decision |
| --- | --- |
| Provider | Google Gemini API directly (no Replicate/OpenAI middlemen). One key for both steps. |
| Analysis model | Cheap Gemini vision model (gemini-flash tier). Produces a "preserve exactly" detail inventory. Toggleable off. |
| Generation model | Nano Banana Pro tier image model via Gemini API, aspect ratio 3:4. Exact model ID pinned at implementation time. |
| Reference image | Optional second input image, passed to the model alongside the main photo; also shown in the compare view. |
| Manual note | Optional free-text field appended to the prompt (e.g. "прибери вішак"). Usually empty. |
| Deployment | Local Next.js server on the operator's machine now; architecture must not block later hosting. |
| Saving | Server writes directly to a configured folder via Node fs. |
| Naming | SKU/article if known, else transliterated slug of the product name. |
| Volume/budget | 50–150 images/week; quality over cost; ~$0.10–0.25 per image is fine. |
| Codebase | Keep the Next.js repo skeleton; rewrite processing internals. Remove sharp, @imgly/background-removal-node, openai, replicate, @fal-ai/client. |

## Architecture

Next.js (App Router) app, one screen. New server modules under `src/lib/`:

- `analyzer.ts` — calls Gemini flash vision model with the main photo (+ reference).
  Returns a structured detail inventory: item count, critical details (buttons, prints,
  textures, closures), phrased as preservation constraints. No "what to remove"
  auto-detection.
- `prompt-builder.ts` — pure function. Base catalog prompt (size, #E9E9E9, centering,
  single product, no extras) + analyzer output (if enabled) + operator note (if any) +
  preset values. Unit-testable.
- `generator.ts` — calls the image edit model with main photo, optional reference,
  built prompt, aspect ratio from preset. Returns image bytes.
- `storage.ts` — resolves filename (SKU → else product-name slug, transliterated),
  writes PNG into the preset's folder, appends a JSON log entry (timestamp, inputs,
  prompt used, output path) for history.
- `presets.ts` + `presets.json` — per-store config: name, target size (goes into
  prompt), background hex (goes into prompt), output folder. Default preset:
  940×1300 / #E9E9E9.

API routes:

- `POST /api/process` — multipart: main image, optional reference, note, preset id,
  analysis on/off. Runs analyze → build prompt → generate. Returns image + metadata
  (prompt used, analysis summary). Long-running (~10–30 s) is fine on a local server;
  no serverless timeout constraints.
- `POST /api/save` — result image + product name/SKU + preset id → writes file,
  returns saved path.
- Phase 2: `POST /api/fetch-product` — product page URL → gallery image URLs +
  product title + SKU/article if detectable.

## UI flow (single screen)

1. Drop 1–2 images (or Phase 2: paste product URL → thumbnails appear).
2. Mark which is **main**, which is **reference** (if two).
3. Optional note field; preset selector; analysis toggle (default on).
4. "Обробити" → progress status (10–30 s).
5. Compare view: **original | result** side by side, reference as a small thumbnail.
   Operator QCs by eye.
6. Buttons: **Зберегти** (asks/confirms SKU or product name → saves to preset folder),
   **Перегенерувати** (optionally edit the note first), **Нове фото**.
7. UI language: Ukrainian.

## Error handling

- Gemini API error / timeout → human-readable message + "Спробувати ще" (retry keeps
  inputs and prompt).
- Model refusal / empty image → surfaced as error, same retry path.
- Save errors (folder missing, permission) → create folder if absent; clear message
  otherwise.
- Analysis failure does not block generation: fall back to base prompt, show a notice.

## Phases

- **Phase 1 (core):** manual upload → analyze → generate → compare → save with proper
  name. Presets hardcoded in `presets.json` with one default store.
- **Phase 2:** product URL fetch (gallery + title + SKU scraping), pick main/reference
  from thumbnails.
- Later (not designed now): hosting for pitching other stores, batch mode, history UI.

## Testing

- Unit: `prompt-builder` (all combinations: analysis on/off, note/no note, presets),
  filename slug/transliteration, preset resolution.
- Integration: API route validation paths (bad type, missing image) without live API.
- Manual: live UI walkthrough in Chrome with a real product photo, screenshot verified;
  golden path + one edge case (API error → retry).

## Risks

- **Model drift on details** remains possible even with top models — mitigated by the
  analyzer's preservation constraints, the compare view, and cheap regeneration.
- **Exact size/color are approximate** by design; if a store later demands exact pixels,
  reintroduce a thin deterministic resize/composite step behind a preset flag.
- **Scraping (Phase 2)** varies per store engine; start with og:image + common gallery
  selectors, degrade gracefully to manual upload.
