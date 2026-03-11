import { NextRequest, NextResponse } from "next/server";
import { fetchCoreApiSchedule, getCurrentSeasonYear } from "@/lib/espn/client";

export const maxDuration = 60;

// Protected debug endpoint — verifies ESPN core API schedule fetch.
// Call with: GET /api/debug/espn-raw?secret=<CRON_SECRET>
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = getCurrentSeasonYear();

  try {
    const events = await fetchCoreApiSchedule(year);

    const summary = events.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      endDate: e.endDate,
      state: e.status?.type?.state,
      completed: e.status?.type?.completed,
      venue: e.venue?.fullName ?? null,
      purse: e.purse,
    }));

    return NextResponse.json({
      year,
      eventCount: events.length,
      first: summary[0] ?? null,
      last: summary[summary.length - 1] ?? null,
      all: summary,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
