import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, tournamentFields } from "@/db/schema";
import { eq, and, gte, lte, or } from "drizzle-orm";

export const maxDuration = 30;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 1. DB state: tournaments in sync window
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

  // 2. Field count for those tournaments
  const fieldCounts = await Promise.all(
    dbTournaments.map(async (t) => {
      const rows = await db
        .select({ count: tournamentFields.id })
        .from(tournamentFields)
        .where(eq(tournamentFields.tournamentId, t.id));
      return { id: t.id, name: t.name, espnId: t.externalTournamentId, fieldCount: rows.length };
    })
  );

  // 3. Raw ESPN event leaderboard for THE PLAYERS (401811937)
  const espnId = dbTournaments[0]?.externalTournamentId ?? 401811937;
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=${espnId}`;
  let espnRaw: unknown = null;
  try {
    const res = await fetch(url, { headers: HEADERS });
    const data = await res.json() as Record<string, unknown>;
    const events = (data.events ?? data.tournaments) as Array<Record<string, unknown>> | undefined;
    const event0 = Array.isArray(events) ? events[0] as Record<string, unknown> : null;
    const competitions = event0?.competitions as Array<Record<string, unknown>> | undefined;
    const comp0 = Array.isArray(competitions) ? competitions[0] : null;
    const competitors = comp0?.competitors as Array<Record<string, unknown>> | undefined;

    espnRaw = {
      httpStatus: res.status,
      topKeys: Object.keys(data),
      eventCount: Array.isArray(events) ? events.length : 0,
      event0Keys: event0 ? Object.keys(event0) : [],
      competitionsCount: Array.isArray(competitions) ? competitions.length : 0,
      comp0Keys: comp0 ? Object.keys(comp0) : [],
      competitorCount: Array.isArray(competitors) ? competitors.length : 0,
      firstCompetitor: Array.isArray(competitors) && competitors.length > 0
        ? { keys: Object.keys(competitors[0]), id: competitors[0].id, athlete: competitors[0].athlete }
        : null,
    };
  } catch (err) {
    espnRaw = { error: String(err) };
  }

  return NextResponse.json({
    dbTournamentsInWindow: fieldCounts,
    espnLeaderboard: espnRaw,
  });
}
