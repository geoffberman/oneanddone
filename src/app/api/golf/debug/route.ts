import { NextRequest, NextResponse } from "next/server";
import {
  fetchCoreApiSchedule,
  fetchLeaderboard,
  fetchEventLeaderboard,
  getCurrentSeasonYear,
  getCompetitors,
  normalizeName,
} from "@/lib/espn/client";

// Debug-only endpoint
// Usage:
//   GET /api/golf/debug?secret=<DEBUG_SECRET>&action=season
//   GET /api/golf/debug?secret=<DEBUG_SECRET>&action=tournaments&year=2025  (uses fetchLeaderboard)
//   GET /api/golf/debug?secret=<DEBUG_SECRET>&action=tournaments-core&year=2025  (uses fetchCoreApiSchedule)
//   GET /api/golf/debug?secret=<DEBUG_SECRET>&action=leaderboard&id=<espnEventId>
//   GET /api/golf/debug?secret=<DEBUG_SECRET>&action=history-lookup&name=THE+PLAYERS+Championship

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.DEBUG_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = request.nextUrl.searchParams.get("action");

  try {
    if (action === "season") {
      const year = getCurrentSeasonYear();
      return NextResponse.json({ year });
    }

    // Uses fetchLeaderboard (site.web.api.espn.com)
    if (action === "tournaments") {
      const yearStr = request.nextUrl.searchParams.get("year");
      const year = yearStr ? parseInt(yearStr) : getCurrentSeasonYear();
      const data = await fetchLeaderboard(year);
      const allEvents = data.events ?? data.tournaments ?? [];
      return NextResponse.json({
        seasonYear: data.season?.year,
        count: allEvents.length,
        tournaments: allEvents.map((t) => ({
          id: t.id,
          name: t.name,
          date: t.date,
          state: t.status?.type?.state,
          competitorCount: getCompetitors(t).length,
        })),
      });
    }

    // Uses fetchCoreApiSchedule (sports.core.api.espn.com — may be blocked)
    if (action === "tournaments-core") {
      const yearStr = request.nextUrl.searchParams.get("year");
      const year = yearStr ? parseInt(yearStr) : getCurrentSeasonYear();
      const espnTournaments = await fetchCoreApiSchedule(year);
      return NextResponse.json({
        count: espnTournaments.length,
        tournaments: espnTournaments.map((t) => ({
          id: t.id,
          name: t.name,
          date: t.date,
          state: t.status.type.state,
        })),
      });
    }

    if (action === "leaderboard") {
      const idStr = request.nextUrl.searchParams.get("id");
      if (!idStr) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      const id = parseInt(idStr);
      const data = await fetchEventLeaderboard(id);
      const allEvents = data.events ?? data.tournaments ?? [];
      const event =
        allEvents.find((t) => parseInt(t.id, 10) === id) ?? allEvents[0];
      const players = event ? getCompetitors(event) : [];
      return NextResponse.json({
        event: event?.name,
        state: event?.status?.type?.state,
        playerCount: players.length,
        samplePlayers: players.slice(0, 5).map((p) => ({
          id: p.id,
          name: p.athlete.displayName,
          position: p.status?.position?.shortDisplayName,
          score: p.score?.value,
        })),
      });
    }

    // Diagnose the full history-lookup path for a given tournament name
    if (action === "history-lookup") {
      const name = request.nextUrl.searchParams.get("name");
      if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

      const currentYear = getCurrentSeasonYear();
      const lastYear = currentYear - 1;
      const diag: Record<string, unknown> = { name, currentYear, lastYear, normalizedName: normalizeName(name) };

      // Step 1: fetchCoreApiSchedule(lastYear) — queries by calendar year
      try {
        const schedule = await fetchCoreApiSchedule(lastYear);
        diag.coreApiEventCount = schedule.length;
        diag.coreApiSampleNames = schedule.slice(0, 5).map(t => ({ id: t.id, name: t.name }));

        const match = schedule.find(t => {
          const na = normalizeName(t.name);
          const nb = normalizeName(name);
          return na === nb || na.includes(nb) || nb.includes(na);
        });
        diag.matchFound = !!match;
        diag.matchName = match?.name;
        diag.matchId = match?.id;

        if (match) {
          const espnId = parseInt(match.id, 10);
          diag.espnId = espnId;

          // Step 2: fetch event-specific leaderboard
          try {
            const eventData = await fetchEventLeaderboard(espnId);
            const events = eventData.events ?? eventData.tournaments ?? [];
            const event = events.find(t => parseInt(t.id, 10) === espnId) ?? events[0];
            const players = event ? getCompetitors(event) : [];
            diag.eventLeaderboardPlayerCount = players.length;
            diag.eventName = event?.name;
            diag.eventState = event?.status?.type?.state;
            if (players.length > 0) {
              diag.samplePlayers = players.slice(0, 3).map(p => ({
                name: p.athlete.displayName,
                pos: p.status?.position?.shortDisplayName,
                score: p.score?.value,
              }));
            }
          } catch (e) {
            diag.eventLeaderboardError = String(e);
          }
        }
      } catch (e) {
        diag.coreApiError = String(e);
      }

      return NextResponse.json(diag);
    }

    return NextResponse.json(
      { error: "Unknown action. Use: season, tournaments, tournaments-core, leaderboard, history-lookup" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
