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
