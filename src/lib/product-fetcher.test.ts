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

const HASH_A = "a".repeat(32);
const HASH_B = "b".repeat(32);
const MAGENTO_HTML = `
<html><head>
  <meta property="og:image" content="https://shop.ua/media/catalog/product/cache/${HASH_A}/1/7/main.png" />
</head><body>
  <div class="gallery">
    <img src="/media/catalog/product/cache/${HASH_B}/1/7/main.png" />
    <img src="/media/catalog/product/cache/${HASH_A}/1/7/second.jpg" />
  </div>
</body></html>`;

function magentoFetch(headOk: boolean) {
  return (async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "HEAD") {
      return new Response(null, {
        status: headOk ? 200 : 404,
        headers: { "content-type": "image/png" },
      });
    }
    return new Response(MAGENTO_HTML, { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
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

  it("extracts the SKU from JSON-LD when markup labels are absent", async () => {
    const html = `
<html><head>
  <script type="application/ld+json">{"@context":"schema.org","@graph":[
    {"@type":"BreadcrumbList"},
    {"@type":"Product","name":"Футболка","sku":"20828000"}
  ]}</script>
</head><body>
  <h1>Трикотажна вкорочена футболка</h1>
  <div class="gallery"><img src="/img/a.jpg" /></div>
</body></html>`;
    const page = await fetchProductPage("https://shop.ua/p/3", {
      fetchFn: fakeFetch(html, { "content-type": "text/html" }),
    });
    expect(page.sku).toBe("20828000");
  });

  it("upgrades Magento cache thumbnails to verified originals and dedupes variants", async () => {
    const page = await fetchProductPage("https://shop.ua/p/1", {
      fetchFn: magentoFetch(true),
    });
    expect(page.images).toEqual([
      "https://shop.ua/media/catalog/product/1/7/main.png",
      "https://shop.ua/media/catalog/product/1/7/second.jpg",
    ]);
  });

  it("keeps Magento cache URLs when the originals do not exist", async () => {
    const page = await fetchProductPage("https://shop.ua/p/1", {
      fetchFn: magentoFetch(false),
    });
    expect(page.images).toHaveLength(3);
    expect(page.images.every((u) => u.includes("/cache/"))).toBe(true);
  });

  it("passes an abort signal through to fetchFn (timeout wiring)", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Response(OG_STORE_HTML, { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    await fetchProductPage("https://shop.ua/p/1", { fetchFn });
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("maps a timeout/abort rejection from fetchFn to a Ukrainian message", async () => {
    const fetchFn = (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof fetch;

    await expect(
      fetchProductPage("https://shop.ua/p/1", { fetchFn })
    ).rejects.toThrow(/час очікування/i);
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

  it("maps a timeout/abort rejection from fetchFn to a Ukrainian message", async () => {
    const fetchFn = (async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as unknown as typeof fetch;

    await expect(
      downloadImage("https://cdn.shop.ua/i.jpg", { fetchFn })
    ).rejects.toThrow(/час очікування/i);
  });
});
