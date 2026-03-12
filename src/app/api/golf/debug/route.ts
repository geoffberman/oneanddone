import { NextRequest, NextResponse } from "next/server";
import {
  fetchCoreApiSchedule,
  fetchEventLeaderboard,
  getCurrentSeasonYear,
  getCompetitors,
} from "@/lib/espn/client";

// Debug-only endpoint
// Usage:
//   GET /api/golf/debug?secret=<DEBUG_SECRET>&action=season              → current season year
//   GET /api/golf/debug?secret=<DEBUG_SECRET>&action=tournaments&year=2025 → all tournament names for year
//   GET /api/golf/debug?secret=<DEBUG_SECRET>&action=leaderboard&id=<espnEventId> → raw leaderboard for event

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.DEBUG_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = request.nextUrl.searchParams.get("action");

  try {
    if (action === "season") {
      const year = getCurrentSeasonYear();
      return NextResponse.json({ year });
    }

    if (action === "tournaments") {
      const yearStr = request.nextUrl.searchParams.get("year");
      const year = yearStr ? parseInt(yearStr) : getCurrentSeasonYear();
      const espnTournaments = await fetchCoreApiSchedule(year);
      return NextResponse.json({
        count: espnTournaments.length,
        tournaments: espnTournaments.map((t) => ({
          id: t.id,
          name: t.name,
          date: t.date,
          state: t.status.type.state,
        })),
      });
    }

    if (action === "leaderboard") {
      const idStr = request.nextUrl.searchParams.get("id");
      if (!idStr) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      const id = parseInt(idStr);
      const data = await fetchEventLeaderboard(id);
      const allEvents = data.events ?? data.tournaments ?? [];
      const event =
        allEvents.find((t) => parseInt(t.id, 10) === id) ?? allEvents[0];
      const players = event ? getCompetitors(event) : [];
      return NextResponse.json({
        event: event?.name,
        state: event?.status?.type?.state,
        playerCount: players.length,
        samplePlayers: players.slice(0, 5).map((p) => ({
          id: p.id,
          name: p.athlete.displayName,
          position: p.status?.position?.shortDisplayName,
          score: p.score?.value,
        })),
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Use: season, tournaments, leaderboard" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
