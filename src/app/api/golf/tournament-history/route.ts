import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { golfers, tournaments, seasons, tournamentResults } from "@/db/schema";
import { eq, and, asc, isNotNull } from "drizzle-orm";
import {
  getCurrentSeasonYear,
  fetchCoreApiSchedule,
  fetchEventLeaderboard,
  splitDisplayName,
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

const cache = new Map<string, { data: YearResult[]; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Try to get the top-10 from the DB for a given tournament name + season year. */
async function top10FromDB(name: string, year: number): Promise<YearResult["results"] | null> {
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.year, year))
    .limit(1);
  if (!season) return null;

  const allTournaments = await db
    .select({ id: tournaments.id, name: tournaments.name })
    .from(tournaments)
    .where(and(eq(tournaments.seasonId, season.id), eq(tournaments.isOver, true), eq(tournaments.canceled, false)));

  const tournament = allTournaments.find((t) => fuzzyMatch(t.name, name));
  if (!tournament) return null;

  const rows = await db
    .select({
      position: tournamentResults.position,
      firstName: golfers.firstName,
      lastName: golfers.lastName,
      totalScoreToPar: tournamentResults.totalScoreToPar,
    })
    .from(tournamentResults)
    .innerJoin(golfers, eq(golfers.id, tournamentResults.golferId))
    .where(and(
      eq(tournamentResults.tournamentId, tournament.id),
      eq(tournamentResults.isWithdrawn, false),
      isNotNull(tournamentResults.position),
    ))
    .orderBy(asc(tournamentResults.position))
    .limit(10);

  return rows.length > 0
    ? rows.map((r) => ({
        position: r.position!,
        firstName: r.firstName,
        lastName: r.lastName,
        totalScoreToPar: r.totalScoreToPar ?? 0,
        earnings: 0,
      }))
    : null;
}

/** Find the ESPN event ID for a tournament name in a past year. */
async function findPastEventId(name: string, year: number): Promise<number | null> {
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

  const schedule = await fetchCoreApiSchedule(year);
  const match = schedule.find((t) => fuzzyMatch(t.name, name));
  return match ? parseInt(match.id, 10) : null;
}

/** Try to get the top-10 from ESPN for a given tournament name + year.
 *  Only accepts events that are fully completed (state === "post").
 *  Returns null if the event is live, not found, or returns bad data. */
async function top10FromESPN(name: string, year: number): Promise<YearResult["results"] | null> {
  const espnId = await findPastEventId(name, year);
  if (!espnId || isNaN(espnId)) return null;

  const data = await fetchEventLeaderboard(espnId);
  const allEvents = data.events ?? data.tournaments ?? [];

  // Try ID match first; fall back to first event only if it matches the name
  let espnEvent = allEvents.find((t) => parseInt(t.id, 10) === espnId);
  if (!espnEvent) {
    const first = allEvents[0];
    if (first && fuzzyMatch(first.name, name)) espnEvent = first;
  }

  // Reject live / non-completed events — ESPN may redirect old IDs to the current live event
  if (!espnEvent || espnEvent.status?.type?.state !== "post") return null;

  const par = espnEvent.courses?.[0]?.par ?? 72;
  const totalPar = par * 4;
  const players = getCompetitors(espnEvent);

  const finishers = players
    .filter((p) => p.score?.value != null)
    .map((p) => {
      const { firstName, lastName } = splitDisplayName(p.athlete.displayName);
      const scoreVal = p.score!.value;
      const winner = p.winner ?? p.score?.winner ?? false;
      const totalScoreToPar =
        Math.abs(scoreVal) <= 100 ? Math.round(scoreVal) : Math.round(scoreVal) - totalPar;
      return { firstName, lastName, totalScoreToPar, scoreVal, winner, earnings: extractEarnings(p.statistics) ?? 0 };
    })
    .sort((a, b) => {
      if (a.winner && !b.winner) return -1;
      if (!a.winner && b.winner) return 1;
      return a.scoreVal - b.scoreVal;
    });

  return finishers.length > 0
    ? finishers.slice(0, 10).map((p, i) => ({
        position: i + 1,
        firstName: p.firstName,
        lastName: p.lastName,
        totalScoreToPar: p.totalScoreToPar,
        earnings: p.earnings,
      }))
    : null;
}

async function getTournamentHistory(name: string): Promise<YearResult[]> {
  const cacheKey = `v4:history:${name}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const currentYear = getCurrentSeasonYear();
  const lastYear = currentYear - 1;
  const years: YearResult[] = [];

  try {
    // DB first (reliable, if synced); ESPN fallback (works outside live-event week)
    const results = (await top10FromDB(name, lastYear)) ?? (await top10FromESPN(name, lastYear));
    if (results && results.length > 0) {
      years.push({ year: lastYear, results });
    }
  } catch (err) {
    console.error(`[TournamentHistory] Error for "${name}" year ${lastYear}:`, err);
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
    return NextResponse.json({ error: "Failed to fetch tournament history" }, { status: 500 });
  }
}
