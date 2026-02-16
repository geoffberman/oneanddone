import { NextRequest, NextResponse } from "next/server";
import { syncSchedule } from "@/lib/sportsdata/sync-schedule";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncSchedule();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("sync-schedule error:", error);
    return NextResponse.json(
      { error: "Failed to sync schedule" },
      { status: 500 }
    );
  }
}
