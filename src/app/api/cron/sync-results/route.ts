import { NextRequest, NextResponse } from "next/server";
import { syncResults } from "@/lib/sportsdata/sync-results";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncResults();
    return NextResponse.json({ success: true, results: result });
  } catch (error) {
    console.error("sync-results error:", error);
    return NextResponse.json(
      { error: "Failed to sync results" },
      { status: 500 }
    );
  }
}
