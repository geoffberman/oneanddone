import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

// Protected debug endpoint — returns raw ESPN API response structure.
// Call with: GET /api/debug/espn-raw?secret=<CRON_SECRET>
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = new Date().getFullYear();
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?season=${year}`;

  try {
    const res = await fetch(url, { headers: HEADERS });
    const status = res.status;
    const text = await res.text();

    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }

    const topKeys = parsed && typeof parsed === "object" ? Object.keys(parsed as object) : [];
    const events = (parsed as Record<string, unknown>)?.events;
    const eventCount = Array.isArray(events) ? events.length : "not an array";

    // Return first event without competitor list (can be huge)
    const firstEventRaw = Array.isArray(events) && events.length > 0
      ? events[0] as Record<string, unknown>
      : null;

    const firstEvent = firstEventRaw
      ? {
          id: firstEventRaw.id,
          name: firstEventRaw.name,
          date: firstEventRaw.date,
          endDate: firstEventRaw.endDate,
          status: firstEventRaw.status,
          purse: firstEventRaw.purse,
          displayPurse: firstEventRaw.displayPurse,
          hasCompetitors: Array.isArray(firstEventRaw.competitors),
          competitorCount: Array.isArray(firstEventRaw.competitors)
            ? (firstEventRaw.competitors as unknown[]).length
            : 0,
          allKeys: Object.keys(firstEventRaw),
        }
      : null;

    const lastEvent = Array.isArray(events) && events.length > 1
      ? {
          id: (events[events.length - 1] as Record<string, unknown>).id,
          name: (events[events.length - 1] as Record<string, unknown>).name,
          date: (events[events.length - 1] as Record<string, unknown>).date,
        }
      : null;

    return NextResponse.json({
      espnStatus: status,
      topKeys,
      eventCount,
      firstEvent,
      lastEvent,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
