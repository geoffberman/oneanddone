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
    return { status: res.status, topKeys, preview: text.slice(0, 300) };
  } catch (err) {
    return { status: -1, topKeys: [], preview: String(err) };
  }
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = new Date().getFullYear();

  const results = await Promise.all([
    probe(`https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/leaderboard`),
    probe(`https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/leaderboard?season=${year}`),
    probe(`https://sports.core.api.espn.com/v2/sports/golf/pga/leagues/pga/events?limit=50&dates=${year}`),
    probe(`https://sports.core.api.espn.com/v2/sports/golf/pga/leagues/pga/events?limit=10`),
    probe(`https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?season=${year}`),
  ]);

  return NextResponse.json({
    "1_leaderboard_no_params": results[0],
    "2_leaderboard_season_year": results[1],
    "3_core_api_events_year": results[2],
    "4_core_api_events_no_year": results[3],
    "5_leaderboard_no_pga": results[4],
  });
}
