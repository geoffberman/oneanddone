import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getCurrentSeasonYear,
  fetchLeaderboard,
  fetchEventLeaderboard,
  splitDisplayName,
  parsePosition,
  extractEarnings,
  getCompetitors,
  normalizeName,
} from "@/lib/espn/client";

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

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function getTournamentHistory(name: string): Promise<YearResult[]> {
  const cacheKey = `history:${name}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const currentYear = getCurrentSeasonYear();
  const lastYear = currentYear - 1;
  const years: YearResult[] = [];

  try {
    // Step 1: find the ESPN event ID for last year's tournament.
    // Try DB first, then fall back to the season leaderboard endpoint
    // (same site.web.api.espn.com domain that sync-results already uses).
    let espnId: number | null = null;

    const [season] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.year, lastYear))
      .limit(1);

    if (season) {
      const seasonTournaments = await db
        .select({
          externalTournamentId: tournaments.externalTournamentId,
          name: tournaments.name,
        })
        .from(tournaments)
        .where(and(eq(tournaments.seasonId, season.id), eq(tournaments.canceled, false)));

      const match = seasonTournaments.find((t) => fuzzyMatch(t.name, name));
      if (match?.externalTournamentId) espnId = match.externalTournamentId;
    }

    // Fallback: fetch the full season leaderboard for last year.
    // /leaderboard?season=YYYY returns all events for that PGA season.
    if (!espnId) {
      try {
        const seasonData = await fetchLeaderboard(lastYear);
        const allEvents = seasonData.events ?? seasonData.tournaments ?? [];
        const match = allEvents.find((t) => fuzzyMatch(t.name, name));
        if (match) {
          espnId = parseInt(match.id, 10);
          // If the season leaderboard already has competitor data, use it
          const players = getCompetitors(match);
          if (players.length > 0) {
            const top10 = buildTop10(players);
            if (top10.length > 0) {
              years.push({ year: lastYear, results: top10 });
              cache.set(cacheKey, { data: years, ts: Date.now() });
              return years;
            }
          }
        }
      } catch (err) {
        console.error(`[TournamentHistory] Season leaderboard fallback failed for ${lastYear}:`, err);
      }
    }

    if (!espnId || isNaN(espnId)) return years;

    // Step 2: fetch the event-specific leaderboard
    const data = await fetchEventLeaderboard(espnId);
    const allEvents = data.events ?? data.tournaments ?? [];
    const espnEvent =
      allEvents.find((t) => parseInt(t.id, 10) === espnId) ?? allEvents[0];
    if (!espnEvent) return years;

    const top10 = buildTop10(getCompetitors(espnEvent));
    if (top10.length > 0) {
      years.push({ year: lastYear, results: top10 });
    }
  } catch (err) {
    console.error(`[TournamentHistory] Error fetching ${lastYear} for "${name}":`, err);
  }

  if (years.length > 0) {
    cache.set(cacheKey, { data: years, ts: Date.now() });
  }

  return years;
}

function buildTop10(players: ReturnType<typeof getCompetitors>) {
  return players
    .map((p) => {
      const pos = parsePosition(p.status?.position?.shortDisplayName);
      const { firstName, lastName } = splitDisplayName(p.athlete.displayName);
      return {
        pos,
        firstName,
        lastName,
        totalScoreToPar: p.score?.value != null ? Math.round(p.score.value) : 0,
        earnings: extractEarnings(p.statistics) ?? 0,
      };
    })
    .filter((p) => p.pos != null)
    .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
    .slice(0, 10)
    .map((p) => ({
      position: p.pos!,
      firstName: p.firstName,
      lastName: p.lastName,
      totalScoreToPar: p.totalScoreToPar,
      earnings: p.earnings,
    }));
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
