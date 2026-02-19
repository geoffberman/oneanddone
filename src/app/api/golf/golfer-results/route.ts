import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { golfers } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  fetchCurrentSeason,
  fetchTournamentsBySeason,
  fetchLeaderboard,
} from "@/lib/sportsdata/client";
import { matchesTournamentName } from "@/lib/sportsdata/tournament-match";

export const maxDuration = 60;

interface GolferYearResult {
  year: number;
  position: number;
  totalScoreToPar: number;
  earnings: number;
  madeCut: boolean;
}

// Simple in-memory cache (key → { data, ts })
const cache = new Map<string, { data: GolferYearResult[]; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getGolferTournamentHistory(
  tournamentName: string,
  externalPlayerId: number
): Promise<GolferYearResult[]> {
  const cacheKey = `golfer:${tournamentName}:${externalPlayerId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const currentSeason = await fetchCurrentSeason();
  const currentYear = currentSeason.SeasonID;
  const results: GolferYearResult[] = [];

  for (const year of [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]) {
    try {
      const tournaments = await fetchTournamentsBySeason(year);
      const match = tournaments.find((t) =>
        matchesTournamentName(t.Name, tournamentName)
      );
      if (!match) continue;

      const leaderboard = await fetchLeaderboard(match.TournamentID);
      const players = leaderboard.Players ?? [];
      if (players.length === 0) continue;

      // Match by PlayerID — reliable even when FirstName/LastName are missing
      const player = players.find((p) => p.PlayerID === externalPlayerId);
      if (!player) continue;

      results.push({
        year,
        position: Math.round(player.Rank),
        totalScoreToPar: Math.round(player.TotalScore),
        earnings: player.Earnings,
        madeCut: player.MadeCut != null ? player.MadeCut >= 0.5 : false,
      });
    } catch (err) {
      console.error(`[GolferResults] Error fetching ${year} for player ${externalPlayerId} at "${tournamentName}":`, err);
    }
  }

  if (results.length > 0) {
    cache.set(cacheKey, { data: results, ts: Date.now() });
  }

  return results;
}

export async function GET(request: NextRequest) {
  const tournamentName = request.nextUrl.searchParams.get("tournamentName");
  const golferIdStr = request.nextUrl.searchParams.get("golferId");

  if (!tournamentName || !golferIdStr) {
    return NextResponse.json(
      { error: "tournamentName and golferId are required" },
      { status: 400 }
    );
  }

  const golferId = parseInt(golferIdStr);
  if (isNaN(golferId)) {
    return NextResponse.json({ error: "Invalid golferId" }, { status: 400 });
  }

  try {
    // Look up external player ID from DB
    const [golfer] = await db
      .select({ externalPlayerId: golfers.externalPlayerId })
      .from(golfers)
      .where(eq(golfers.id, golferId))
      .limit(1);

    if (!golfer) {
      return NextResponse.json({ results: [] });
    }

    const results = await getGolferTournamentHistory(
      tournamentName,
      golfer.externalPlayerId
    );
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch golfer results" },
      { status: 500 }
    );
  }
}
