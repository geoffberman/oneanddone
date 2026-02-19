import { NextRequest, NextResponse } from "next/server";
import { resolvePicks } from "@/lib/sportsdata/resolve-picks";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await resolvePicks();
    return NextResponse.json({ success: true, results: result });
  } catch (error) {
    console.error("resolve-picks error:", error);
    return NextResponse.json(
      { error: "Failed to resolve picks" },
      { status: 500 }
    );
  }
}
