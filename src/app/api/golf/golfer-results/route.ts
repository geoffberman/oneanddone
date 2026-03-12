import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { golfers, tournaments, seasons, tournamentResults } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { normalizeName } from "@/lib/espn/client";

export const maxDuration = 30;

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

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function getGolferTournamentHistory(
  tournamentName: string,
  golferInternalId: number
): Promise<GolferYearResult[]> {
  const cacheKey = `v3:golfer:${tournamentName}:${golferInternalId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  // Find all completed tournaments whose name fuzzy-matches the requested name
  const allTournaments = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      year: seasons.year,
    })
    .from(tournaments)
    .innerJoin(seasons, eq(seasons.id, tournaments.seasonId))
    .where(and(eq(tournaments.isOver, true), eq(tournaments.canceled, false)));

  const matched = allTournaments.filter((t) => fuzzyMatch(t.name, tournamentName));
  if (matched.length === 0) return [];

  const tournamentIds = matched.map((t) => t.id);
  const yearByTournamentId = new Map(matched.map((t) => [t.id, t.year]));

  // Get this golfer's results for those tournaments
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
    .where(
      and(
        eq(tournamentResults.golferId, golferInternalId),
        inArray(tournamentResults.tournamentId, tournamentIds)
      )
    )
    .orderBy(desc(tournamentResults.tournamentId));

  const results: GolferYearResult[] = rows
    .filter((r) => !r.isWithdrawn)
    .map((r) => ({
      year: yearByTournamentId.get(r.tournamentId)!,
      position: r.position ?? 0,
      totalScoreToPar: r.totalScoreToPar ?? 0,
      earnings: parseFloat(r.earnings ?? "0"),
      madeCut: r.madeCut ?? (r.position != null && r.position > 0),
    }))
    .sort((a, b) => b.year - a.year);

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
    const results = await getGolferTournamentHistory(tournamentName, golferId);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch golfer results" },
      { status: 500 }
    );
  }
}
