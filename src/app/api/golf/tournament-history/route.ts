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

/** Find the ESPN event ID for a given tournament name in a past year.
 *  Tries the DB first; falls back to ESPN Core API schedule (dates=year). */
async function findPastEventId(name: string, year: number): Promise<number | null> {
  // 1. Try DB (works if we have past year season data)
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.year, year))
    .limit(1);

  if (season) {
    const rows = await db
      .select({ externalTournamentId: tournaments.externalTournamentId, name: tournaments.name })
      .from(tournaments)
      .where(and(eq(tournaments.seasonId, season.id), eq(tournaments.canceled, false)));

    const match = rows.find((t) => fuzzyMatch(t.name, name));
    if (match?.externalTournamentId) return match.externalTournamentId;
  }

  // 2. Fallback: ESPN Core API — queries by calendar year (dates=YYYY)
  //    Returns the full schedule for that year regardless of current season.
  const schedule = await fetchCoreApiSchedule(year);
  const match = schedule.find((t) => fuzzyMatch(t.name, name));
  return match ? parseInt(match.id, 10) : null;
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
    const espnId = await findPastEventId(name, lastYear);
    if (!espnId || isNaN(espnId)) return years;

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
  const mapped = players.map((p) => {
    const pos = parsePosition(p.status?.position?.shortDisplayName);
    const { firstName, lastName } = splitDisplayName(p.athlete.displayName);
    const scoreVal = p.score?.value ?? null;
    // If score.value > 100 it's total strokes (historical events); otherwise score-to-par
    const totalScoreToPar =
      scoreVal != null && Math.abs(scoreVal) <= 100 ? Math.round(scoreVal) : 0;
    return {
      pos,
      firstName,
      lastName,
      totalScoreToPar,
      scoreVal,
      rounds: p.linescores?.length ?? 0,
      earnings: extractEarnings(p.statistics) ?? 0,
    };
  });

  // Primary path: explicit numeric positions from status.position
  const withPos = mapped.filter((p) => p.pos != null);
  if (withPos.length >= 5) {
    return withPos
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

  // Fallback: for completed events where status.position isn't populated,
  // sort 4-round finishers by total score ascending (lower strokes = better).
  const finishers = mapped
    .filter((p) => p.rounds >= 4 && p.scoreVal != null)
    .sort((a, b) => (a.scoreVal ?? 0) - (b.scoreVal ?? 0));

  return finishers.slice(0, 10).map((p, i) => ({
    position: i + 1,
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
