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
