import { NextRequest, NextResponse } from "next/server";
import { syncSchedule } from "@/lib/sportsdata/sync-schedule";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Debug: show raw API response to check property names
    const key = process.env.SPORTSDATA_API_KEY;
    const debugRes = await fetch(
      "https://api.sportsdata.io/golf/v2/json/CurrentSeason",
      { headers: { "Ocp-Apim-Subscription-Key": key! } }
    );
    const debugData = await debugRes.json();

    return NextResponse.json({
      debug: true,
      keys: Object.keys(debugData),
      data: debugData,
    });
  } catch (error) {
    console.error("sync-schedule error:", error);
    return NextResponse.json(
      {
        error: "Failed to sync schedule",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
