import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, tournamentFields, golfers } from "@/db/schema";
import { eq, and, gte, lte, asc, desc, or } from "drizzle-orm";
import { getCurrentTournament, getTournamentField } from "@/lib/queries/tournaments";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. What does getCurrentTournament() return?
  const currentTournament = await getCurrentTournament();

  // 2. Field for that tournament
  const currentField = currentTournament
    ? await getTournamentField(currentTournament.id)
    : [];

  // 3. Directly check id=395 (THE PLAYERS 2026)
  const [players395] = await db
    .select({ id: tournaments.id, name: tournaments.name, startDate: tournaments.startDate, isOver: tournaments.isOver, isInProgress: tournaments.isInProgress, seasonId: tournaments.seasonId })
    .from(tournaments)
    .where(eq(tournaments.id, 395))
    .limit(1);

  const field395Count = await db
    .select({ id: tournamentFields.id, golferId: tournamentFields.golferId })
    .from(tournamentFields)
    .where(eq(tournamentFields.tournamentId, 395));

  // 4. Check how many of those golfer_ids actually exist in the golfers table
  const golferIds = field395Count.map((r) => r.golferId);
  let validGolferCount = 0;
  if (golferIds.length > 0) {
    const validGolfers = await db
      .select({ id: golfers.id })
      .from(golfers)
      .where(eq(golfers.id, golferIds[0])); // spot check first one
    validGolferCount = validGolfers.length;
  }

  // 5. Next 5 upcoming tournaments by startDate
  const now = new Date();
  const upcoming = await db
    .select({ id: tournaments.id, name: tournaments.name, startDate: tournaments.startDate, isOver: tournaments.isOver, seasonId: tournaments.seasonId })
    .from(tournaments)
    .where(and(gte(tournaments.startDate, now), eq(tournaments.isOver, false), eq(tournaments.canceled, false)))
    .orderBy(asc(tournaments.startDate))
    .limit(5);

  return NextResponse.json({
    currentTournament: currentTournament
      ? { id: currentTournament.id, name: currentTournament.name, startDate: currentTournament.startDate, isOver: currentTournament.isOver, isInProgress: currentTournament.isInProgress, seasonId: currentTournament.seasonId }
      : null,
    currentFieldCount: currentField.length,
    tournament395: players395 ?? null,
    field395TotalRows: field395Count.length,
    firstGolferIdInField395: golferIds[0] ?? null,
    firstGolferExistsInGolfersTable: validGolferCount > 0,
    next5Upcoming: upcoming,
  });
}
