import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { golfers, tournaments, seasons, tournamentResults } from "@/db/schema";
import { eq, and, inArray, desc, isNotNull } from "drizzle-orm";
import {
  getCurrentSeasonYear,
  fetchCoreApiSchedule,
  fetchEventLeaderboard,
  parsePosition,
  extractEarnings,
  getCompetitors,
  madeCut,
  normalizeName,
} from "@/lib/espn/client";

export const maxDuration = 60;

interface GolferYearResult {
  year: number;
  position: number;
  totalScoreToPar: number;
  earnings: number;
  madeCut: boolean;
}

const cache = new Map<string, { data: GolferYearResult[]; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Query the DB for a golfer's results at a named tournament across all synced seasons. */
async function resultsFromDB(
  golferInternalId: number,
  tournamentName: string
): Promise<GolferYearResult[] | null> {
  const allTournaments = await db
    .select({ id: tournaments.id, name: tournaments.name, year: seasons.year })
    .from(tournaments)
    .innerJoin(seasons, eq(seasons.id, tournaments.seasonId))
    .where(and(eq(tournaments.isOver, true), eq(tournaments.canceled, false)));

  const matched = allTournaments.filter((t) => fuzzyMatch(t.name, tournamentName));
  if (matched.length === 0) return null;

  const tournamentIds = matched.map((t) => t.id);
  const yearById = new Map(matched.map((t) => [t.id, t.year]));

  const rows = await db
    .select({
      tournamentId: tournamentResults.tournamentId,
      position: tournamentResults.position,
      totalScoreToPar: tournamentResults.totalScoreToPar,
      madeCut: tournamentResults.madeCut,
      isWithdrawn: tournamentResults.isWithdrawn,
      earnings: tournamentResults.earnings,
    })
    .from(tournamentResults)
    .where(and(
      eq(tournamentResults.golferId, golferInternalId),
      inArray(tournamentResults.tournamentId, tournamentIds),
    ));

  if (rows.length === 0) return null;

  return rows
    .filter((r) => !r.isWithdrawn)
    .map((r) => ({
      year: yearById.get(r.tournamentId)!,
      position: r.position ?? 0,
      totalScoreToPar: r.totalScoreToPar ?? 0,
      earnings: parseFloat(r.earnings ?? "0"),
      madeCut: r.madeCut ?? (r.position != null && r.position > 0),
    }))
    .sort((a, b) => b.year - a.year);
}

/** Find the ESPN event ID for a tournament name in a given year. */
async function findEspnEventId(name: string, year: number): Promise<number | null> {
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

/** Query ESPN for a golfer's result at a named tournament in a given year.
 *  Only accepts completed events (state === "post") to prevent live data pollution. */
async function resultFromESPN(
  tournamentName: string,
  year: number,
  espnPlayerId: number
): Promise<GolferYearResult | null> {
  const espnId = await findEspnEventId(tournamentName, year);
  if (!espnId || isNaN(espnId)) return null;

  const data = await fetchEventLeaderboard(espnId);
  const allEvents = data.events ?? data.tournaments ?? [];

  let espnEvent = allEvents.find((t) => parseInt(t.id, 10) === espnId);
  if (!espnEvent) {
    const first = allEvents[0];
    if (first && fuzzyMatch(first.name, tournamentName)) espnEvent = first;
  }

  // Reject live events — ESPN may redirect historical IDs to the current active tournament
  if (!espnEvent || espnEvent.status?.type?.state !== "post") return null;

  const isOver = espnEvent.status.type.completed && espnEvent.status.type.state === "post";
  const players = getCompetitors(espnEvent);
  const player = players.find((p) => parseInt(p.id, 10) === espnPlayerId);
  if (!player) return null;

  const pos = player.status?.position?.shortDisplayName;
  const upper = pos?.toUpperCase();
  if (upper === "WD" || upper === "DQ") return null;

  const scoreVal = player.score?.value ?? null;
  const par = espnEvent.courses?.[0]?.par ?? 72;
  const totalScoreToPar =
    scoreVal == null ? 0
    : Math.abs(scoreVal) <= 100 ? Math.round(scoreVal)
    : Math.round(scoreVal) - par * 4;

  if (upper === "CUT" || upper === "MC" || upper === "MDF") {
    return { year, position: 0, totalScoreToPar, earnings: 0, madeCut: false };
  }

  let position = parsePosition(pos);

  if (position == null && isOver) {
    const finishers = players
      .filter((p) => {
        const pu = p.status?.position?.shortDisplayName?.toUpperCase();
        return p.score?.value != null && pu !== "WD" && pu !== "DQ" && pu !== "CUT" && pu !== "MC" && pu !== "MDF";
      })
      .sort((a, b) => {
        const aWin = a.winner ?? a.score?.winner ?? false;
        const bWin = b.winner ?? b.score?.winner ?? false;
        if (aWin && !bWin) return -1;
        if (!aWin && bWin) return 1;
        return (a.score!.value) - (b.score!.value);
      });
    const idx = finishers.findIndex((p) => parseInt(p.id, 10) === espnPlayerId);
    if (idx === -1) return null;
    position = idx + 1;
  }

  if (position == null) return null;

  return {
    year,
    position,
    totalScoreToPar,
    earnings: extractEarnings(player.statistics) ?? 0,
    madeCut: isOver ? true : (madeCut(pos, isOver) ?? false),
  };
}

async function getGolferTournamentHistory(
  tournamentName: string,
  golferId: number,
  espnPlayerId: number
): Promise<GolferYearResult[]> {
  const cacheKey = `v4:golfer:${tournamentName}:${golferId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  // 1. DB first — accurate, uses data synced during live events
  const dbResults = await resultsFromDB(golferId, tournamentName);
  if (dbResults && dbResults.length > 0) {
    cache.set(cacheKey, { data: dbResults, ts: Date.now() });
    return dbResults;
  }

  // 2. ESPN fallback for up to 2 past years — only accepted if event is completed
  const currentYear = getCurrentSeasonYear();
  const espnResults: GolferYearResult[] = [];

  for (const year of [currentYear - 1, currentYear - 2]) {
    try {
      const result = await resultFromESPN(tournamentName, year, espnPlayerId);
      if (result) espnResults.push(result);
    } catch (err) {
      console.error(`[GolferResults] ESPN error for ${year}:`, err);
    }
  }

  if (espnResults.length > 0) {
    cache.set(cacheKey, { data: espnResults, ts: Date.now() });
  }
  return espnResults;
}

export async function GET(request: NextRequest) {
  const tournamentName = request.nextUrl.searchParams.get("tournamentName");
  const golferIdStr = request.nextUrl.searchParams.get("golferId");

  if (!tournamentName || !golferIdStr) {
    return NextResponse.json({ error: "tournamentName and golferId are required" }, { status: 400 });
  }

  const golferId = parseInt(golferIdStr);
  if (isNaN(golferId)) {
    return NextResponse.json({ error: "Invalid golferId" }, { status: 400 });
  }

  try {
    const [golfer] = await db
      .select({ externalPlayerId: golfers.externalPlayerId })
      .from(golfers)
      .where(eq(golfers.id, golferId))
      .limit(1);

    if (!golfer) return NextResponse.json({ results: [] });

    const results = await getGolferTournamentHistory(tournamentName, golferId, golfer.externalPlayerId);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Failed to fetch golfer results" }, { status: 500 });
  }
}
