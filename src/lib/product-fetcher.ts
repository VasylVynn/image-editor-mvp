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
const FETCH_TIMEOUT_MS = 15_000;

// Combines a caller-passed signal (e.g. the incoming request's, aborted when
// the client disconnects) with an internal ~15s timeout, so a slow/hanging
// upstream can never keep this request in flight indefinitely.
function boundedSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchWithTimeout(
  deps: FetchDeps,
  url: string,
  signal?: AbortSignal
): Promise<Response> {
  try {
    return await deps.fetchFn(url, {
      headers: { "User-Agent": "Mozilla/5.0 (catalog-image-tool)" },
      signal: boundedSignal(signal),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      // User-surfaced via route error handlers — Ukrainian.
      throw new Error("Час очікування вичерпано. Спробуйте ще раз");
    }
    throw err;
  }
}

// Most store engines (Magento, Shopify, Woo) publish the SKU in JSON-LD
// structured data even when the visible "Код:" is rendered client-side.
function findSkuDeep(node: unknown, depth = 0): string | null {
  if (depth > 4 || node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findSkuDeep(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.sku === "string" && record.sku.trim()) return record.sku.trim();
  if (typeof record.sku === "number") return String(record.sku);
  for (const key of ["@graph", "mainEntity", "offers", "itemListElement", "item"]) {
    const found = findSkuDeep(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function skuFromJsonLd($: cheerio.CheerioAPI): string | null {
  let found: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      found = findSkuDeep(JSON.parse($(el).text()));
    } catch {
      /* malformed JSON-LD — skip */
    }
  });
  return found;
}

export async function fetchProductPage(
  url: string,
  deps: FetchDeps = { fetchFn: fetch },
  signal?: AbortSignal
): Promise<ProductPage> {
  const base = new URL(url); // throws on invalid URL
  const response = await fetchWithTimeout(deps, url, signal);
  if (!response.ok) throw new Error(`Сторінка недоступна: HTTP ${response.status}`);
  const $ = cheerio.load(await response.text());

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").text().split("|")[0].split("—")[0].trim() ||
    null;

  let sku = $('[itemprop="sku"]').first().text().trim() || null;
  if (!sku) sku = skuFromJsonLd($);
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

  const images = await upgradeToOriginals(urls.slice(0, MAX_GALLERY), deps, signal);
  return { title, sku, images };
}

// Magento serves gallery thumbnails from /media/catalog/product/cache/<hash>/…;
// the full-resolution original lives at the same path without the cache segment
// (observed 192×265 thumb vs 868×1200 original on a real store). Swap each
// cache URL for its original when the original actually exists (HEAD check),
// and dedupe — several cache variants of one file collapse into one original.
const MAGENTO_CACHE = /(\/media\/catalog\/product)\/cache\/[0-9a-f]{32}(\/.+)$/;

async function upgradeToOriginals(
  urls: string[],
  deps: FetchDeps,
  signal?: AbortSignal
): Promise<string[]> {
  const verified = new Map<string, boolean>();
  const candidates = urls.map((url) => {
    const match = url.match(MAGENTO_CACHE);
    return match ? url.replace(MAGENTO_CACHE, "$1$2") : null;
  });

  await Promise.all(
    [...new Set(candidates.filter((c): c is string => c !== null))].map(async (original) => {
      try {
        const response = await deps.fetchFn(original, {
          method: "HEAD",
          headers: { "User-Agent": "Mozilla/5.0 (catalog-image-tool)" },
          signal: boundedSignal(signal),
        });
        verified.set(
          original,
          response.ok && (response.headers.get("content-type")?.startsWith("image/") ?? true)
        );
      } catch {
        verified.set(original, false);
      }
    })
  );

  const result: string[] = [];
  urls.forEach((url, i) => {
    const original = candidates[i];
    const final = original && verified.get(original) ? original : url;
    if (!result.includes(final)) result.push(final);
  });
  return result;
}

export async function downloadImage(
  url: string,
  deps: FetchDeps = { fetchFn: fetch },
  signal?: AbortSignal
): Promise<ImageInput> {
  const response = await fetchWithTimeout(deps, url, signal);
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
