import { NextRequest, NextResponse } from "next/server";
import {
  fetchCurrentSeason,
  fetchTournamentsBySeason,
  fetchLeaderboard,
} from "@/lib/sportsdata/client";
import { matchesTournamentName } from "@/lib/sportsdata/tournament-match";

export const maxDuration = 60;

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

function getPlayerName(p: Record<string, unknown>): { first: string; last: string } {
  if (p.FirstName && p.LastName) return { first: String(p.FirstName), last: String(p.LastName) };
  if (p.Name) {
    const parts = String(p.Name).split(" ");
    return { first: parts[0] || "?", last: parts.slice(1).join(" ") || "?" };
  }
  return { first: "?", last: "?" };
}

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
      if (!match) continue;

      const leaderboard = await fetchLeaderboard(match.TournamentID);
      const players = leaderboard.Players ?? [];
      if (players.length === 0) continue;

      const top10 = players
        .filter((p) => p.Rank > 0 && (p.MadeCut == null || p.MadeCut >= 0.5))
        .sort((a, b) => a.Rank - b.Rank)
        .slice(0, 10)
        .map((p) => {
          const { first, last } = getPlayerName(p as unknown as Record<string, unknown>);
          return {
            position: Math.round(p.Rank),
            firstName: first,
            lastName: last,
            totalScoreToPar: Math.round(p.TotalScore),
            earnings: p.Earnings,
          };
        });

      if (top10.length > 0) {
        years.push({ year, results: top10 });
      }
    } catch (err) {
      console.error(`[TournamentHistory] Error fetching ${year} for "${name}":`, err);
    }
  }

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
