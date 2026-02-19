import { NextRequest, NextResponse } from "next/server";
import {
  fetchCurrentSeason,
  fetchTournamentsBySeason,
  fetchLeaderboard,
} from "@/lib/sportsdata/client";

// Debug-only endpoint – remove before production
// Usage:
//   GET /api/golf/debug?action=seasons               → current season
//   GET /api/golf/debug?action=tournaments&year=2025  → all tournament names for year
//   GET /api/golf/debug?action=leaderboard&id=521     → raw leaderboard for tournament ID

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  try {
    if (action === "seasons") {
      const season = await fetchCurrentSeason();
      return NextResponse.json(season);
    }

    if (action === "tournaments") {
      const yearStr = request.nextUrl.searchParams.get("year");
      const year = yearStr ? parseInt(yearStr) : (await fetchCurrentSeason()).Season;
      const tournaments = await fetchTournamentsBySeason(year);
      return NextResponse.json(
        tournaments.map((t) => ({
          id: t.TournamentID,
          name: t.Name,
          start: t.StartDate,
          isOver: t.IsOver,
        }))
      );
    }

    if (action === "leaderboard") {
      const idStr = request.nextUrl.searchParams.get("id");
      if (!idStr) return NextResponse.json({ error: "id required" }, { status: 400 });
      const leaderboard = await fetchLeaderboard(parseInt(idStr));
      return NextResponse.json({
        tournament: leaderboard.Tournament?.Name,
        playerCount: leaderboard.Players?.length,
        top5: leaderboard.Players?.slice(0, 5).map((p) => ({
          name: `${p.FirstName} ${p.LastName}`,
          rank: p.Rank,
          score: p.TotalScore,
          madeCut: p.MadeCut,
        })),
      });
    }

    return NextResponse.json({
      usage: [
        "?action=seasons",
        "?action=tournaments&year=2025",
        "?action=leaderboard&id=<tournamentId>",
      ],
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}
