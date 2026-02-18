import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.SPORTSDATA_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  try {
    // Fetch players and return the first one's full field list
    const res = await fetch(
      "https://api.sportsdata.io/golf/v2/json/Players",
      { headers: { "Ocp-Apim-Subscription-Key": key } }
    );
    const players = await res.json();
    const sample = players[0];

    // Also check a top player - Scottie Scheffler (likely has a ranking)
    const topPlayer = players.find(
      (p: Record<string, unknown>) =>
        (p.LastName as string)?.toLowerCase() === "scheffler" ||
        (p.LastName as string)?.toLowerCase() === "mcilroy"
    );

    return NextResponse.json({
      totalPlayers: players.length,
      sampleFieldNames: Object.keys(sample),
      samplePlayer: sample,
      topPlayer: topPlayer || "not found",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
