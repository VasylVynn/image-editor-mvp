import { NextResponse } from "next/server";
import { getPreset } from "@/lib/presets";
import { resolveFilename } from "@/lib/naming";
import { saveResult } from "@/lib/storage";
import { appendEvent } from "@/lib/events";
import { upscaleImage } from "@/lib/upscaler";
import { getUpscaler } from "@/lib/upscalers";
import { withTimeout } from "@/lib/timeout";

const UPSCALE_TIMEOUT_MS = 60_000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { image, sku, productName, presetId, promptUsed, model, pipeline, sessionId, upscale, upscalerId } =
      body as {
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
        /** Run the final image through an upscaler before writing it. */
        upscale?: boolean;
        upscalerId?: string;
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
    const mimeType = image.startsWith("data:")
      ? image.slice(5, image.indexOf(";"))
      : "image/png";
    let imageBase64 = image.startsWith("data:")
      ? image.slice(image.indexOf(",") + 1)
      : image;

    // Optional final upscale before the file hits the disk. Failure keeps the
    // original image — the operator is told via upscaleFailed, the save wins.
    let upscaled = false;
    let upscaleFailed = false;
    if (upscale === true) {
      try {
        const result = await withTimeout(
          upscaleImage(getUpscaler(upscalerId).falEndpoint, { data: imageBase64, mimeType }),
          UPSCALE_TIMEOUT_MS,
          `Upscale timeout after ${UPSCALE_TIMEOUT_MS}ms`
        );
        imageBase64 = result.data;
        upscaled = true;
      } catch (err) {
        console.error("Final upscale failed, saving the original image:", err);
        upscaleFailed = true;
      }
    }

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
      upscaled: upscaled || undefined,
    });
    return NextResponse.json({ path: filePath, upscaleFailed });
  } catch (error) {
    console.error("Save error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Помилка збереження" },
      { status: 500 }
    );
  }
}
