import { NextRequest, NextResponse } from "next/server";
import {
  fetchCurrentSeason,
  fetchTournamentsBySeason,
  fetchLeaderboard,
} from "@/lib/sportsdata/client";
import { matchesTournamentName } from "@/lib/sportsdata/tournament-match";

interface YearResult {
  year: number;
  results: {
    position: number;
    firstName: string;
    lastName: string;
    totalScoreToPar: number;
    earnings: number;
  }[];
}

// Simple in-memory cache (key → { data, ts })
const cache = new Map<string, { data: YearResult[]; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getTournamentHistory(name: string): Promise<YearResult[]> {
  const cacheKey = `history:${name}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const currentSeason = await fetchCurrentSeason();
  const currentYear = currentSeason.SeasonID;
  const years: YearResult[] = [];

  for (const year of [currentYear - 1, currentYear - 2, currentYear - 3]) {
    try {
      const tournaments = await fetchTournamentsBySeason(year);
      const match = tournaments.find((t) =>
        matchesTournamentName(t.Name, name)
      );
      if (!match) {
        console.log(`[TournamentHistory] No match for "${name}" in ${year}`);
        continue;
      }

      const leaderboard = await fetchLeaderboard(match.TournamentID);
      const players = leaderboard.Players ?? [];
      if (players.length === 0) {
        console.log(`[TournamentHistory] No players in leaderboard for "${match.Name}" (${year}, id=${match.TournamentID})`);
        continue;
      }

      const top10 = players
        .filter((p) => p.Rank > 0 && p.MadeCut === 1)
        .sort((a, b) => a.Rank - b.Rank)
        .slice(0, 10)
        .map((p) => ({
          position: p.Rank,
          firstName: p.FirstName,
          lastName: p.LastName,
          totalScoreToPar: p.TotalScore,
          earnings: p.Earnings,
        }));

      if (top10.length > 0) {
        years.push({ year, results: top10 });
      }
    } catch (err) {
      console.error(`[TournamentHistory] Error fetching ${year} for "${name}":`, err);
    }
  }

  // Only cache if we got results — don't cache empty failures
  if (years.length > 0) {
    cache.set(cacheKey, { data: years, ts: Date.now() });
  }

  return years;
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const years = await getTournamentHistory(name);
    return NextResponse.json({ years });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch tournament history" },
      { status: 500 }
    );
  }
}
