import { NextResponse } from "next/server";
import { loadPresets, savePresets } from "@/lib/presets";
import { validatePresets, type Preset } from "@/lib/preset-schema";

export async function GET() {
  try {
    return NextResponse.json({ presets: await loadPresets() });
  } catch (error) {
    console.error("Load presets error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не вдалося прочитати пресети" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  let presets: Preset[];
  try {
    const body = await request.json();
    presets = body?.presets;
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const errors = validatePresets(presets ?? []);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("\n") }, { status: 400 });
  }

  try {
    await savePresets(presets);
    return NextResponse.json({ presets });
  } catch (error) {
    console.error("Save presets error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не вдалося зберегти пресети" },
      { status: 500 }
    );
  }
}
