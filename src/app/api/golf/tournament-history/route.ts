import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { golfers, tournaments, seasons, tournamentResults } from "@/db/schema";
import { eq, and, asc, isNotNull } from "drizzle-orm";
import { getCurrentSeasonYear, normalizeName } from "@/lib/espn/client";

export const maxDuration = 30;

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
  const cacheKey = `v3:history:${name}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const currentYear = getCurrentSeasonYear();
  const lastYear = currentYear - 1;
  const years: YearResult[] = [];

  try {
    // Find season for last year
    const [season] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.year, lastYear))
      .limit(1);
    if (!season) return years;

    // Find completed tournament with fuzzy name match
    const allTournaments = await db
      .select({ id: tournaments.id, name: tournaments.name })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.seasonId, season.id),
          eq(tournaments.isOver, true),
          eq(tournaments.canceled, false)
        )
      );

    const tournament = allTournaments.find((t) => fuzzyMatch(t.name, name));
    if (!tournament) return years;

    // Get top 10 finishers by position
    const rows = await db
      .select({
        position: tournamentResults.position,
        firstName: golfers.firstName,
        lastName: golfers.lastName,
        totalScoreToPar: tournamentResults.totalScoreToPar,
      })
      .from(tournamentResults)
      .innerJoin(golfers, eq(golfers.id, tournamentResults.golferId))
      .where(
        and(
          eq(tournamentResults.tournamentId, tournament.id),
          eq(tournamentResults.isWithdrawn, false),
          isNotNull(tournamentResults.position)
        )
      )
      .orderBy(asc(tournamentResults.position))
      .limit(10);

    if (rows.length > 0) {
      years.push({
        year: lastYear,
        results: rows.map((r) => ({
          position: r.position!,
          firstName: r.firstName,
          lastName: r.lastName,
          totalScoreToPar: r.totalScoreToPar ?? 0,
          earnings: 0,
        })),
      });
    }
  } catch (err) {
    console.error(`[TournamentHistory] DB error for "${name}" year ${lastYear}:`, err);
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
