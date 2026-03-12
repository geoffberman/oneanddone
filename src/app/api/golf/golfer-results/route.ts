import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { golfers, tournaments, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getCurrentSeasonYear,
  fetchCoreApiSchedule,
  fetchLeaderboard,
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
      // Strategy 1: season-level leaderboard (reliable for historical/completed data)
      let espnEvent = null;
      try {
        const data = await fetchLeaderboard(year);
        const allEvents = data.events ?? data.tournaments ?? [];
        espnEvent = allEvents.find((t) =>
          fuzzyMatch(t.name, tournamentName) && t.status?.type?.state === "post"
        ) ?? null;
      } catch { /* fall through */ }

      // Strategy 2: event-specific leaderboard (must be completed — guard against live redirects)
      if (!espnEvent) {
        const espnId = await findEspnEventId(tournamentName, year);
        if (!espnId || isNaN(espnId)) continue;
        const data = await fetchEventLeaderboard(espnId);
        const allEvents = data.events ?? data.tournaments ?? [];
        const candidate = allEvents.find((t) => parseInt(t.id, 10) === espnId) ?? allEvents[0];
        // Reject live/non-completed events to prevent current-year data polluting history
        if (candidate?.status?.type?.state === "post") espnEvent = candidate;
      }

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

      // For completed events where status.position isn't populated, derive from total score rank.
      // Sort by score.value directly (lower = better for both total strokes and score-to-par).
      // Do NOT use linescores: for historical events ESPN stores per-round stroke counts there
      // (e.g. 68, 67, 66, 65), not cumulative score-to-par, which would give wrong ordering.
      if (position == null && isOver) {
        const finishers = players
          .filter((p) => {
            const pu = p.status?.position?.shortDisplayName?.toUpperCase();
            return (
              p.score?.value != null &&
              pu !== "WD" && pu !== "DQ" && pu !== "CUT" && pu !== "MC" && pu !== "MDF"
            );
          })
          .sort((a, b) => {
            const aWin = a.winner ?? a.score?.winner ?? false;
            const bWin = b.winner ?? b.score?.winner ?? false;
            if (aWin && !bWin) return -1;
            if (!aWin && bWin) return 1;
            return (a.score!.value) - (b.score!.value);
          });
        const idx = finishers.findIndex((p) => parseInt(p.id, 10) === espnPlayerId);
        if (idx === -1) continue; // player not in finishers list
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
