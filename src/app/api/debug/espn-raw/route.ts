import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, parsed, text };
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = new Date().getFullYear();

  // Step 1: get the list of event refs from core API
  const listUrl = `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events?limit=100&dates=${year}`;
  const { status: listStatus, parsed: listParsed } = await fetchJson(listUrl);

  const items = (listParsed as Record<string, unknown>)?.items;
  const firstRef = Array.isArray(items) && items.length > 0
    ? (items[0] as Record<string, unknown>).$ref as string
    : null;
  const lastRef = Array.isArray(items) && items.length > 1
    ? (items[items.length - 1] as Record<string, unknown>).$ref as string
    : null;

  // Step 2: fetch the detail of the first event via the core API $ref
  let firstEventDetail: unknown = null;
  let firstEventKeys: string[] = [];
  if (firstRef) {
    // Convert internal pvt URL to public URL if needed
    const publicRef = firstRef.replace("sports.core.api.espn.pvt", "sports.core.api.espn.com");
    const { status: detailStatus, parsed: detailParsed } = await fetchJson(publicRef);
    firstEventDetail = { status: detailStatus, allKeys: detailParsed && typeof detailParsed === "object" ? Object.keys(detailParsed as object) : [] };
    firstEventKeys = detailParsed && typeof detailParsed === "object" ? Object.keys(detailParsed as object) : [];

    // Show key fields we care about for sync-schedule
    if (detailParsed && typeof detailParsed === "object") {
      const d = detailParsed as Record<string, unknown>;
      firstEventDetail = {
        httpStatus: detailStatus,
        id: d.id,
        name: d.name,
        shortName: d.shortName,
        date: d.date,
        endDate: d.endDate,
        status: d.status,
        purse: d.purse,
        displayPurse: d.displayPurse,
        venue: d.venue,
        allKeys: firstEventKeys,
      };
    }
  }

  return NextResponse.json({
    coreApiList: {
      status: listStatus,
      count: (listParsed as Record<string, unknown>)?.count,
      firstRef,
      lastRef,
    },
    firstEventDetail,
  });
}
