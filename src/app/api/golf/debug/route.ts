import { NextRequest, NextResponse } from "next/server";
import {
  fetchCurrentSeason,
  fetchTournamentsBySeason,
  fetchLeaderboard,
} from "@/lib/sportsdata/client";
import { matchesTournamentName } from "@/lib/sportsdata/tournament-match";

// Debug-only endpoint – remove before production
// Usage:
//   GET /api/golf/debug?action=seasons               → current season
//   GET /api/golf/debug?action=tournaments&year=2025  → all tournament names for year
//   GET /api/golf/debug?action=leaderboard&id=521     → raw leaderboard for tournament ID
//   GET /api/golf/debug?action=history&name=Genesis+Invitational → test full history flow

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
        playersIsNull: leaderboard.Players === null,
        playersIsUndefined: leaderboard.Players === undefined,
        top5: leaderboard.Players?.slice(0, 5).map((p) => ({
          name: `${p.FirstName} ${p.LastName}`,
          rank: p.Rank,
          score: p.TotalScore,
          madeCut: p.MadeCut,
        })),
      });
    }

    if (action === "history") {
      const name = request.nextUrl.searchParams.get("name");
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

      const currentSeason = await fetchCurrentSeason();
      const currentYear = currentSeason.Season;
      const diagnostics: Record<string, unknown>[] = [];

      for (const year of [currentYear - 1, currentYear - 2, currentYear - 3]) {
        const diag: Record<string, unknown> = { year };
        try {
          const tournaments = await fetchTournamentsBySeason(year);
          diag.tournamentCount = tournaments.length;

          const match = tournaments.find((t) => matchesTournamentName(t.Name, name));
          if (!match) {
            diag.matched = false;
            // Show closest names for debugging
            diag.allNames = tournaments.map((t) => t.Name).slice(0, 10);
            diagnostics.push(diag);
            continue;
          }

          diag.matched = true;
          diag.matchedName = match.Name;
          diag.matchedId = match.TournamentID;
          diag.isOver = match.IsOver;

          const leaderboard = await fetchLeaderboard(match.TournamentID);
          diag.playersIsNull = leaderboard.Players === null;
          diag.playersIsUndefined = leaderboard.Players === undefined;
          diag.playerCount = leaderboard.Players?.length ?? 0;

          const players = leaderboard.Players ?? [];
          const withRank = players.filter((p) => p.Rank > 0 && p.MadeCut === 1);
          diag.playersWithRank = withRank.length;

          if (withRank.length > 0) {
            diag.top3 = withRank
              .sort((a, b) => a.Rank - b.Rank)
              .slice(0, 3)
              .map((p) => `${p.Rank}. ${p.FirstName} ${p.LastName}`);
          }
        } catch (err) {
          diag.error = String(err);
        }
        diagnostics.push(diag);
      }

      return NextResponse.json({ currentYear, searchName: name, years: diagnostics });
    }

    return NextResponse.json({
      usage: [
        "?action=seasons",
        "?action=tournaments&year=2025",
        "?action=leaderboard&id=<tournamentId>",
        "?action=history&name=<tournament name>",
      ],
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}
