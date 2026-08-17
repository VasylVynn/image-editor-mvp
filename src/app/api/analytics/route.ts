import { NextResponse } from "next/server";
import { ENGINES } from "@/lib/engines";
import { loadEvents, computeAnalytics } from "@/lib/events";
import { loadVotes, summarizeVotes } from "@/lib/votes";

export async function GET(request: Request) {
  try {
    const daysParam = new URL(request.url).searchParams.get("days");
    const days = daysParam ? Number(daysParam) : null;
    const sinceMs =
      days && Number.isFinite(days) && days > 0
        ? Date.now() - days * 24 * 60 * 60 * 1000
        : undefined;

    const priceMap = Object.fromEntries(ENGINES.map((e) => [e.id, e.priceUsd]));
    const [events, votes] = await Promise.all([loadEvents(), loadVotes()]);
    const analytics = computeAnalytics(events, priceMap, sinceMs);
    const voteSummary = summarizeVotes(
      sinceMs ? votes.filter((v) => Date.parse(v.timestamp) >= sinceMs) : votes
    );
    return NextResponse.json({ ...analytics, votes: voteSummary });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Не вдалося порахувати аналітику" }, { status: 500 });
  }
}
