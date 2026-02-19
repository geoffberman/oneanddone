import { NextRequest, NextResponse } from "next/server";
import {
  fetchCurrentSeason,
  fetchTournamentsBySeason,
  fetchLeaderboard,
} from "@/lib/sportsdata/client";
import { matchesTournamentName } from "@/lib/sportsdata/tournament-match";

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
  firstName: string,
  lastName: string
): Promise<GolferYearResult[]> {
  const cacheKey = `golfer:${tournamentName}:${firstName}:${lastName}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const currentSeason = await fetchCurrentSeason();
  const currentYear = currentSeason.Season;
  const results: GolferYearResult[] = [];

  for (const year of [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]) {
    try {
      const tournaments = await fetchTournamentsBySeason(year);
      const match = tournaments.find((t) =>
        matchesTournamentName(t.Name, tournamentName)
      );
      if (!match) {
        console.log(`[GolferResults] No match for "${tournamentName}" in ${year}`);
        continue;
      }

      const leaderboard = await fetchLeaderboard(match.TournamentID);
      const players = leaderboard.Players ?? [];
      if (players.length === 0) {
        console.log(`[GolferResults] No players in leaderboard for "${match.Name}" (${year}, id=${match.TournamentID})`);
        continue;
      }

      const player = players.find(
        (p) =>
          p.FirstName.toLowerCase() === firstName.toLowerCase() &&
          p.LastName.toLowerCase() === lastName.toLowerCase()
      );
      if (!player) continue;

      results.push({
        year,
        position: player.Rank,
        totalScoreToPar: player.TotalScore,
        earnings: player.Earnings,
        madeCut: player.MadeCut === 1,
      });
    } catch (err) {
      console.error(`[GolferResults] Error fetching ${year} for "${firstName} ${lastName}" at "${tournamentName}":`, err);
    }
  }

  // Only cache if we got results
  if (results.length > 0) {
    cache.set(cacheKey, { data: results, ts: Date.now() });
  }

  return results;
}

export async function GET(request: NextRequest) {
  const tournamentName = request.nextUrl.searchParams.get("tournamentName");
  const firstName = request.nextUrl.searchParams.get("firstName");
  const lastName = request.nextUrl.searchParams.get("lastName");

  if (!tournamentName || !firstName || !lastName) {
    return NextResponse.json(
      { error: "tournamentName, firstName, and lastName are required" },
      { status: 400 }
    );
  }

  try {
    const results = await getGolferTournamentHistory(
      tournamentName,
      firstName,
      lastName
    );
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch golfer results" },
      { status: 500 }
    );
  }
}
