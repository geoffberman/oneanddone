import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getCurrentSeasonYear,
  fetchCoreApiSchedule,
  fetchLeaderboard,
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

/** Fetch the completed ESPN event for a named tournament in a given past year.
 *  Tries fetchLeaderboard(year) first (season-level, reliable for historical data),
 *  then falls back to fetchEventLeaderboard(id) validated against completed status. */
async function fetchCompletedEvent(name: string, year: number) {
  // Strategy 1: season-level leaderboard — reliable for historical/completed events
  try {
    const data = await fetchLeaderboard(year);
    const allEvents = data.events ?? data.tournaments ?? [];
    const event = allEvents.find((t) =>
      fuzzyMatch(t.name, name) && t.status?.type?.state === "post"
    );
    if (event) return event;
  } catch {
    // fall through to strategy 2
  }

  // Strategy 2: event-specific leaderboard — must validate it's actually completed
  // (ESPN may return the CURRENT year's live tournament when queried by an old event ID)
  const espnId = await findPastEventId(name, year);
  if (!espnId || isNaN(espnId)) return null;

  const data = await fetchEventLeaderboard(espnId);
  const allEvents = data.events ?? data.tournaments ?? [];
  const event = allEvents.find((t) => parseInt(t.id, 10) === espnId) ?? allEvents[0];

  // Reject non-completed events — this prevents live 2026 data from leaking into 2025 results
  if (!event || event.status?.type?.state !== "post") return null;
  return event;
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
    const espnEvent = await fetchCompletedEvent(name, lastYear);
    if (!espnEvent) return years;

    const par = espnEvent.courses?.[0]?.par ?? 72;
    const top10 = buildTop10(getCompetitors(espnEvent), par);
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

function buildTop10(players: ReturnType<typeof getCompetitors>, par = 72) {
  const totalPar = par * 4;

  // Sort directly by score.value (lower = better in both total-strokes and score-to-par formats).
  // Do NOT use linescores for sorting: for historical events ESPN stores per-round stroke counts
  // in linescores (e.g. 68, 67, 66, 65), not cumulative score-to-par. Values ≤100 from the last
  // linescore would be a single-round score, scrambling the overall sort.
  // The winner flag breaks playoff ties (winner's score.value equals the runner-up's).
  const finishers = players
    .filter((p) => p.score?.value != null)
    .map((p) => {
      const { firstName, lastName } = splitDisplayName(p.athlete.displayName);
      const scoreVal = p.score!.value;
      const winner = p.winner ?? p.score?.winner ?? false;
      const totalScoreToPar =
        Math.abs(scoreVal) <= 100
          ? Math.round(scoreVal)
          : Math.round(scoreVal) - totalPar;
      return { firstName, lastName, totalScoreToPar, scoreVal, winner, earnings: extractEarnings(p.statistics) ?? 0 };
    })
    .sort((a, b) => {
      if (a.winner && !b.winner) return -1;
      if (!a.winner && b.winner) return 1;
      return a.scoreVal - b.scoreVal; // lower total strokes or lower score-to-par = better
    });

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
