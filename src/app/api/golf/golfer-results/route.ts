import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { golfers, tournaments, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getCurrentSeasonYear,
  fetchEventLeaderboard,
  parsePosition,
  extractEarnings,
  getCompetitors,
  madeCut,
} from "@/lib/espn/client";

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

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+(presented|powered|sponsored)\s+by\s+.*/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function getGolferTournamentHistory(
  tournamentName: string,
  espnPlayerId: number
): Promise<GolferYearResult[]> {
  const cacheKey = `golfer:${tournamentName}:${espnPlayerId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const currentYear = getCurrentSeasonYear();
  const results: GolferYearResult[] = [];

  for (const year of [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]) {
    try {
      const [season] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.year, year))
        .limit(1);
      if (!season) continue;

      const seasonTournaments = await db
        .select({
          externalTournamentId: tournaments.externalTournamentId,
          name: tournaments.name,
        })
        .from(tournaments)
        .where(and(eq(tournaments.seasonId, season.id), eq(tournaments.canceled, false)));

      const match = seasonTournaments.find((t) => fuzzyMatch(t.name, tournamentName));
      if (!match?.externalTournamentId) continue;

      const data = await fetchEventLeaderboard(match.externalTournamentId);
      const allEvents = data.events ?? data.tournaments ?? [];
      const espnEvent =
        allEvents.find((t) => parseInt(t.id, 10) === match.externalTournamentId) ??
        allEvents[0];
      if (!espnEvent) continue;

      const isOver =
        espnEvent.status.type.completed && espnEvent.status.type.state === "post";
      const players = getCompetitors(espnEvent);
      const player = players.find((p) => parseInt(p.id, 10) === espnPlayerId);
      if (!player) continue;

      const pos = player.status?.position?.shortDisplayName;
      const position = parsePosition(pos);
      if (position == null) continue; // skip CUT/WD/DQ

      results.push({
        year,
        position,
        totalScoreToPar: player.score?.value != null ? Math.round(player.score.value) : 0,
        earnings: extractEarnings(player.statistics) ?? 0,
        madeCut: madeCut(pos, isOver) ?? false,
      });
    } catch (err) {
      console.error(
        `[GolferResults] Error fetching ${year} for player ${espnPlayerId} at "${tournamentName}":`,
        err
      );
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
    const [golfer] = await db
      .select({ externalPlayerId: golfers.externalPlayerId })
      .from(golfers)
      .where(eq(golfers.id, golferId))
      .limit(1);

    if (!golfer) {
      return NextResponse.json({ results: [] });
    }

    const results = await getGolferTournamentHistory(tournamentName, golfer.externalPlayerId);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch golfer results" },
      { status: 500 }
    );
  }
}
