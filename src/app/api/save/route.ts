import { NextResponse } from "next/server";
import { getPreset } from "@/lib/presets";
import { resolveFilename } from "@/lib/naming";
import { saveResult } from "@/lib/storage";
import { appendEvent } from "@/lib/events";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { image, sku, productName, presetId, promptUsed, model, pipeline, sessionId } = body as {
      image?: string;
      sku?: string;
      productName?: string;
      presetId?: string;
      promptUsed?: string;
      /** Engine that generated the saved image — analytics attribution. */
      model?: string;
      /** Which path produced the image ("deterministic" | "generative"). */
      pipeline?: string;
      /** Links the save to its generation attempts in the events log. */
      sessionId?: string;
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

    const preset = await getPreset(presetId || "default");
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
      pipeline,
    });
    await appendEvent({
      type: "save",
      engineId: model,
      presetId: preset.id,
      file: filePath.split("/").pop(),
      pipeline: pipeline === "deterministic" || pipeline === "generative" ? pipeline : undefined,
      sessionId: typeof sessionId === "string" ? sessionId.slice(0, 64) : undefined,
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
