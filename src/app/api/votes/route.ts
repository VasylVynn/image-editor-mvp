import { NextResponse } from "next/server";
import { ENGINES } from "@/lib/engines";
import { appendVote, loadVotes, summarizeVotes } from "@/lib/votes";

export async function GET() {
  try {
    const votes = await loadVotes();
    return NextResponse.json({ summary: summarizeVotes(votes), total: votes.length });
  } catch (error) {
    console.error("Load votes error:", error);
    return NextResponse.json({ error: "Не вдалося прочитати голоси" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      engineId?: string;
      vote?: string;
      presetId?: string;
    };
    // Accept votes for removed engines' ids too? No — only current registry,
    // the UI can't produce anything else.
    if (!body.engineId || !ENGINES.some((e) => e.id === body.engineId)) {
      return NextResponse.json({ error: "Невідома модель" }, { status: 400 });
    }
    if (body.vote !== "up" && body.vote !== "down") {
      return NextResponse.json({ error: "Голос має бути up або down" }, { status: 400 });
    }
    await appendVote({ engineId: body.engineId, vote: body.vote, presetId: body.presetId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Save vote error:", error);
    return NextResponse.json({ error: "Не вдалося зберегти голос" }, { status: 500 });
  }
}
