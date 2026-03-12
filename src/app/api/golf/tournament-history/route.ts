import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getCurrentSeasonYear,
  fetchCoreApiSchedule,
  fetchEventLeaderboard,
  splitDisplayName,
  parsePosition,
  extractEarnings,
  getCompetitors,
  type EspnTournament,
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

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+(presented?|powered|sponsored|pres\.?)\s+by\s+.*/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Find ESPN event ID for a tournament name in a given year.
 *  Tries the DB first; falls back to ESPN schedule API. */
async function findEspnEventId(
  name: string,
  year: number
): Promise<number | null> {
  // 1. Try DB
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.year, year))
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
    if (match?.externalTournamentId) return match.externalTournamentId;
  }

  // 2. Fallback: ESPN schedule API
  try {
    const espnTournaments: EspnTournament[] = await fetchCoreApiSchedule(year);
    const match = espnTournaments.find((t) => fuzzyMatch(t.name, name));
    if (match) return parseInt(match.id, 10);
  } catch (err) {
    console.error(`[TournamentHistory] ESPN schedule fallback failed for ${year}:`, err);
  }

  return null;
}

async function getTournamentHistory(name: string): Promise<YearResult[]> {
  const cacheKey = `history:${name}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const currentYear = getCurrentSeasonYear();
  const years: YearResult[] = [];

  for (const year of [currentYear - 1, currentYear - 2, currentYear - 3]) {
    try {
      const espnId = await findEspnEventId(name, year);
      if (!espnId || isNaN(espnId)) continue;

      // Fetch ESPN leaderboard for this event
      const data = await fetchEventLeaderboard(espnId);
      const allEvents = data.events ?? data.tournaments ?? [];
      const espnEvent =
        allEvents.find((t) => parseInt(t.id, 10) === espnId) ?? allEvents[0];
      if (!espnEvent) continue;

      const players = getCompetitors(espnEvent);
      if (players.length === 0) continue;

      const top10 = players
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
