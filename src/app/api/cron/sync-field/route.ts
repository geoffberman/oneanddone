import { NextRequest, NextResponse } from "next/server";
import { syncField } from "@/lib/sportsdata/sync-field";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncField();
    return NextResponse.json({ success: true, results: result });
  } catch (error) {
    console.error("sync-field error:", error);
    return NextResponse.json(
      { error: "Failed to sync field" },
      { status: 500 }
    );
  }
}
