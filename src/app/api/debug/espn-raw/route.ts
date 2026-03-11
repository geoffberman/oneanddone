import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function probe(url: string) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    const topKeys = parsed && typeof parsed === "object" ? Object.keys(parsed as object) : [];
    // Count events/tournaments at top level
    const events = (parsed as Record<string, unknown>)?.events;
    const tournaments = (parsed as Record<string, unknown>)?.tournaments;
    const count = Array.isArray(events) ? events.length : Array.isArray(tournaments) ? tournaments.length : "n/a";
    const firstName = Array.isArray(events) && events.length > 0
      ? (events[0] as Record<string, unknown>).name
      : Array.isArray(tournaments) && tournaments.length > 0
      ? (tournaments[0] as Record<string, unknown>).name
      : null;
    const lastName = Array.isArray(events) && events.length > 1
      ? (events[events.length - 1] as Record<string, unknown>).name
      : Array.isArray(tournaments) && tournaments.length > 1
      ? (tournaments[tournaments.length - 1] as Record<string, unknown>).name
      : null;
    return { status: res.status, topKeys, count, firstName, lastName, preview: text.slice(0, 200) };
  } catch (err) {
    return { status: -1, topKeys: [], count: "err", firstName: null, lastName: null, preview: String(err) };
  }
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = new Date().getFullYear();

  const results = await Promise.all([
    probe(`https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?season=${year}`),
    probe(`https://site.web.api.espn.com/apis/site/v2/sports/golf/schedule?season=${year}`),
    probe(`https://site.web.api.espn.com/apis/site/v2/sports/golf/scoreboard?season=${year}&seasontype=2&limit=100`),
    probe(`https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/schedule?season=${year}`),
    probe(`https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events?limit=100&dates=${year}`),
  ]);

  return NextResponse.json({
    "1_leaderboard_season": results[0],
    "2_golf_schedule": results[1],
    "3_golf_scoreboard": results[2],
    "4_golf_pga_schedule": results[3],
    "5_core_api_pga_events": results[4],
  });
}
