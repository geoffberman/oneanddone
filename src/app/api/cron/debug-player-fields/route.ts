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

  const base = "https://api.sportsdata.io/golf/v2/json";
  const headers = { "Ocp-Apim-Subscription-Key": key };
  const results: Record<string, unknown> = {};

  // Try WorldGolfRankings endpoint
  for (const endpoint of [
    "WorldGolfRankings",
    "WorldGolfRankings/2026",
    "PlayerSeasonStats/2026",
  ]) {
    try {
      const res = await fetch(`${base}/${endpoint}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data?.Players || data?.Rankings || [data];
        results[endpoint] = {
          status: res.status,
          count: items.length,
          sampleFields: items[0] ? Object.keys(items[0]) : [],
          sample: items[0] || null,
        };
      } else {
        results[endpoint] = { status: res.status, error: res.statusText };
      }
    } catch (err) {
      results[endpoint] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json(results);
}
