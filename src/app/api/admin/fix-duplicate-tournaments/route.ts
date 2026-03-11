import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, picks, usedGolfers, tournamentFields } from "@/db/schema";
import { eq, and, lt, gte, sql, inArray } from "drizzle-orm";

export const maxDuration = 30;

/**
 * One-time fix: old tournament records (ESPN IDs < 10000) had their startDates
 * updated to 2026 by sync-schedule, creating duplicates of the new 401811xxx records.
 * This causes getCurrentTournament() to return the old 0-field record instead of the
 * new one with the full field.
 *
 * GET  → dry run: shows what would be canceled, and whether picks exist
 * POST → applies the fix (marks old duplicates as canceled=true)
 */

async function getOldDuplicates() {
  return db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      espnId: tournaments.externalTournamentId,
      startDate: tournaments.startDate,
      isOver: tournaments.isOver,
      canceled: tournaments.canceled,
    })
    .from(tournaments)
    .where(
      and(
        lt(tournaments.externalTournamentId, 10000),          // old-style ESPN IDs
        gte(tournaments.startDate, new Date("2026-01-01")),   // given a 2026 date
        eq(tournaments.canceled, false),
        eq(tournaments.isOver, false)                         // skip completed ones that have picks
      )
    );
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oldDups = await getOldDuplicates();
  const ids = oldDups.map((t) => t.id);

  let pickCount = 0;
  let usedGolferCount = 0;
  if (ids.length > 0) {
    const pickRows = await db
      .select({ id: picks.id })
      .from(picks)
      .where(inArray(picks.tournamentId, ids));
    pickCount = pickRows.length;

    const ugRows = await db
      .select({ id: usedGolfers.id })
      .from(usedGolfers)
      .where(inArray(usedGolfers.tournamentId, ids));
    usedGolferCount = ugRows.length;
  }

  return NextResponse.json({
    wouldCancel: oldDups,
    count: oldDups.length,
    picksOnOldRecords: pickCount,
    usedGolfersOnOldRecords: usedGolferCount,
    safe: pickCount === 0,
    instruction: pickCount === 0
      ? "Safe to POST this endpoint to apply the fix"
      : "WARNING: picks exist for old records — manual review required",
  });
}

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oldDups = await getOldDuplicates();
  const ids = oldDups.map((t) => t.id);

  if (ids.length === 0) {
    return NextResponse.json({ message: "Nothing to fix", canceled: [] });
  }

  // Safety check: abort if picks exist
  const pickRows = await db
    .select({ id: picks.id })
    .from(picks)
    .where(inArray(picks.tournamentId, ids));

  if (pickRows.length > 0) {
    return NextResponse.json(
      { error: "Picks exist for old tournament records — aborting. Manual review required.", pickCount: pickRows.length },
      { status: 409 }
    );
  }

  const now = new Date();
  await db
    .update(tournaments)
    .set({ canceled: true, updatedAt: now })
    .where(inArray(tournaments.id, ids));

  return NextResponse.json({
    message: "Fixed",
    canceledIds: ids,
    canceledTournaments: oldDups.map((t) => ({ id: t.id, name: t.name, espnId: t.espnId })),
  });
}
