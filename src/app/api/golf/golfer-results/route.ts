import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { golfers, tournaments, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
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

// Simple in-memory cache (key → { data, ts })
const cache = new Map<string, { data: GolferYearResult[]; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Find ESPN event ID for a tournament name in a given year.
 *  Tries the DB first; falls back to ESPN Core API schedule (dates=year). */
async function findEspnEventId(name: string, year: number): Promise<number | null> {
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
  const schedule = await fetchCoreApiSchedule(year);
  const match = schedule.find((t) => fuzzyMatch(t.name, name));
  return match ? parseInt(match.id, 10) : null;
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

  // Check current year + last year
  for (const year of [currentYear, currentYear - 1]) {
    try {
      const espnId = await findEspnEventId(tournamentName, year);
      if (!espnId || isNaN(espnId)) continue;

      const data = await fetchEventLeaderboard(espnId);
      const allEvents = data.events ?? data.tournaments ?? [];
      const espnEvent =
        allEvents.find((t) => parseInt(t.id, 10) === espnId) ?? allEvents[0];
      if (!espnEvent) continue;

      const isOver =
        espnEvent.status.type.completed && espnEvent.status.type.state === "post";
      const players = getCompetitors(espnEvent);
      const player = players.find((p) => parseInt(p.id, 10) === espnPlayerId);
      if (!player) continue;

      const pos = player.status?.position?.shortDisplayName;
      const upper = pos?.toUpperCase();

      // Skip withdrawn or disqualified — these aren't meaningful finishes
      if (upper === "WD" || upper === "DQ") {
        continue;
      }

      const scoreVal = player.score?.value ?? null;
      const par = espnEvent.courses?.[0]?.par ?? 72;
      const totalScoreToPar =
        scoreVal == null
          ? 0
          : Math.abs(scoreVal) <= 100
            ? Math.round(scoreVal)
            : Math.round(scoreVal) - par * 4;

      // Missed cut — record with madeCut: false
      if (upper === "CUT" || upper === "MC" || upper === "MDF") {
        results.push({
          year,
          position: 0,
          totalScoreToPar,
          earnings: 0,
          madeCut: false,
        });
        continue;
      }

      let position = parsePosition(pos);

      // For completed events where status.position isn't populated, derive from total strokes rank.
      // Linescores are CUMULATIVE score-to-par; the last period includes playoff holes,
      // so the playoff winner naturally has a lower value than the loser.
      if (position == null && isOver) {
        const lastLsValue = (p: typeof player) => {
          const ls = (p.linescores ?? []).slice().sort((a, b) => a.period.number - b.period.number);
          const last = ls[ls.length - 1];
          if (last != null && Math.abs(last.value) <= 100) return last.value;
          return p.score?.value ?? Infinity;
        };
        const finishers = players
          .filter((p) => {
            const pu = p.status?.position?.shortDisplayName?.toUpperCase();
            return (
              (p.linescores?.length ?? 0) >= 4 &&
              pu !== "WD" && pu !== "DQ" && pu !== "CUT" && pu !== "MC" && pu !== "MDF" &&
              p.score?.value != null
            );
          })
          .sort((a, b) => {
            const aWin = a.winner ?? a.score?.winner ?? false;
            const bWin = b.winner ?? b.score?.winner ?? false;
            if (aWin && !bWin) return -1;
            if (!aWin && bWin) return 1;
            return lastLsValue(a) - lastLsValue(b);
          });
        const idx = finishers.findIndex((p) => parseInt(p.id, 10) === espnPlayerId);
        if (idx === -1) continue; // player didn't finish 4 rounds
        position = idx + 1;
      }

      if (position == null) continue; // can't determine position

      results.push({
        year,
        position,
        totalScoreToPar,
        earnings: extractEarnings(player.statistics) ?? 0,
        madeCut: isOver ? true : (madeCut(pos, isOver) ?? false),
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
