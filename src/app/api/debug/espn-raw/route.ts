import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { and, eq, gte, lte, or } from "drizzle-orm";
import { fetchLeaderboard, fetchEventLeaderboard, getCurrentSeasonYear } from "@/lib/espn/client";

export const maxDuration = 30;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

// Protected debug endpoint — diagnoses why sync-field finds no golfers.
// Call with: GET /api/debug/espn-raw?secret=<CRON_SECRET>
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 1. What does sync-field see in the DB?
  const dbTournaments = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      externalTournamentId: tournaments.externalTournamentId,
      startDate: tournaments.startDate,
      isOver: tournaments.isOver,
      isInProgress: tournaments.isInProgress,
    })
    .from(tournaments)
    .where(
      and(
        eq(tournaments.canceled, false),
        or(
          and(gte(tournaments.startDate, now), lte(tournaments.startDate, nextWeek)),
          and(gte(tournaments.startDate, lastWeek), eq(tournaments.isOver, false)),
          eq(tournaments.isInProgress, true)
        )
      )
    );

  // 2. For each DB tournament in window, check ESPN competitor count
  const espnChecks = await Promise.all(
    dbTournaments.map(async (t) => {
      if (!t.externalTournamentId) return { ...t, espnCompetitors: "no ESPN ID" };

      // Check season leaderboard
      let seasonCompetitors = 0;
      let eventCompetitors = 0;
      let eventError = null;

      try {
        const year = getCurrentSeasonYear();
        const seasonData = await fetchLeaderboard(year);
        const allEvents = seasonData.events ?? seasonData.tournaments ?? [];
        const match = allEvents.find((e) => parseInt(e.id, 10) === t.externalTournamentId);
        seasonCompetitors = match?.competitors?.length ?? 0;
      } catch { /* ignore */ }

      try {
        const eventData = await fetchEventLeaderboard(t.externalTournamentId);
        const allEvents = eventData.events ?? eventData.tournaments ?? [];
        const match = allEvents.find((e) => parseInt(e.id, 10) === t.externalTournamentId) ?? allEvents[0];
        eventCompetitors = match?.competitors?.length ?? 0;
      } catch (err) {
        eventError = String(err);
      }

      return {
        id: t.id,
        name: t.name,
        espnId: t.externalTournamentId,
        startDate: t.startDate,
        seasonLeaderboardCompetitors: seasonCompetitors,
        eventLeaderboardCompetitors: eventCompetitors,
        eventError,
      };
    })
  );

  // 3. Also check raw event leaderboard for THE PLAYERS directly
  const playersId = 401811937;
  const rawUrl = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=${playersId}`;
  let rawCheck: unknown = null;
  try {
    const res = await fetch(rawUrl, { headers: HEADERS });
    const data = await res.json() as Record<string, unknown>;
    const events = (data.events ?? data.tournaments) as Array<Record<string, unknown>> | undefined;
    rawCheck = {
      status: res.status,
      topKeys: Object.keys(data),
      eventCount: Array.isArray(events) ? events.length : 0,
      firstEventKeys: Array.isArray(events) && events[0] ? Object.keys(events[0]) : [],
      competitorCount: Array.isArray(events) && events[0]
        ? (Array.isArray(events[0].competitors) ? (events[0].competitors as unknown[]).length : "no competitors key")
        : null,
    };
  } catch (err) {
    rawCheck = { error: String(err) };
  }

  return NextResponse.json({
    now,
    dbTournamentsInWindow: dbTournaments.length,
    espnChecks,
    rawPlayersLeaderboard: rawCheck,
  });
}
