import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

// Protected debug endpoint — returns the raw ESPN leaderboard API response
// so we can verify the response structure matches our TypeScript types.
// Call with: GET /api/debug/espn-raw?secret=<CRON_SECRET>
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = new Date().getFullYear();
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/leaderboard?season=${year}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    const status = res.status;
    const text = await res.text();

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON
    }

    // Return top-level keys + first tournament summary (without full competitor list)
    const topLevelKeys = parsed && typeof parsed === "object"
      ? Object.keys(parsed as object)
      : [];

    const tournaments = (parsed as Record<string, unknown>)?.tournaments;
    const tournamentCount = Array.isArray(tournaments) ? tournaments.length : "not an array";

    const firstTournament = Array.isArray(tournaments) && tournaments.length > 0
      ? {
          id: (tournaments[0] as Record<string, unknown>).id,
          name: (tournaments[0] as Record<string, unknown>).name,
          status: (tournaments[0] as Record<string, unknown>).status,
          hasCompetitors: Array.isArray((tournaments[0] as Record<string, unknown>).competitors),
          competitorCount: Array.isArray((tournaments[0] as Record<string, unknown>).competitors)
            ? ((tournaments[0] as Record<string, unknown>).competitors as unknown[]).length
            : 0,
          tournamentKeys: Object.keys(tournaments[0] as object),
        }
      : null;

    const lastTournament = Array.isArray(tournaments) && tournaments.length > 1
      ? {
          id: (tournaments[tournaments.length - 1] as Record<string, unknown>).id,
          name: (tournaments[tournaments.length - 1] as Record<string, unknown>).name,
          hasCompetitors: Array.isArray((tournaments[tournaments.length - 1] as Record<string, unknown>).competitors),
          competitorCount: Array.isArray((tournaments[tournaments.length - 1] as Record<string, unknown>).competitors)
            ? ((tournaments[tournaments.length - 1] as Record<string, unknown>).competitors as unknown[]).length
            : 0,
        }
      : null;

    return NextResponse.json({
      espnStatus: status,
      topLevelKeys,
      tournamentCount,
      firstTournament,
      lastTournament,
      rawPreview: text.slice(0, 500),
    });
  } catch (err) {
    return NextResponse.json({
      error: String(err),
    }, { status: 500 });
  }
}
