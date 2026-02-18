import { db } from "@/db";
import {
  tournaments,
  tournamentFields,
  golfers,
  usedGolfers,
  seasons,
} from "@/db/schema";
import { eq, and, gte, asc, desc, sql } from "drizzle-orm";

export async function getCurrentTournament() {
  const now = new Date();

  // First try to find an in-progress tournament
  const [inProgress] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.isInProgress, true))
    .limit(1);

  if (inProgress) return inProgress;

  // Otherwise find the next upcoming tournament
  const [upcoming] = await db
    .select()
    .from(tournaments)
    .where(
      and(
        gte(tournaments.startDate, now),
        eq(tournaments.isOver, false),
        eq(tournaments.canceled, false)
      )
    )
    .orderBy(asc(tournaments.startDate))
    .limit(1);

  return upcoming || null;
}

export async function getSeasonTournaments(seasonId: number) {
  return db
    .select()
    .from(tournaments)
    .where(eq(tournaments.seasonId, seasonId))
    .orderBy(asc(tournaments.startDate));
}

export async function getLatestSeason() {
  const [season] = await db
    .select()
    .from(seasons)
    .orderBy(desc(seasons.year))
    .limit(1);

  return season || null;
}

let _ensuredWorldRanking = false;
async function ensureWorldRankingColumn() {
  if (_ensuredWorldRanking) return;
  await db.execute(sql`ALTER TABLE golfers ADD COLUMN IF NOT EXISTS world_ranking integer`);
  _ensuredWorldRanking = true;
}

export async function getTournamentField(
  tournamentId: number,
  options?: { gameId?: number; userId?: string }
) {
  await ensureWorldRankingColumn();

  const fieldEntries = await db
    .select({
      fieldId: tournamentFields.id,
      golferId: golfers.id,
      firstName: golfers.firstName,
      lastName: golfers.lastName,
      country: golfers.country,
      photoUrl: golfers.photoUrl,
      worldRanking: golfers.worldRanking,
      isWithdrawn: tournamentFields.isWithdrawn,
    })
    .from(tournamentFields)
    .innerJoin(golfers, eq(tournamentFields.golferId, golfers.id))
    .where(eq(tournamentFields.tournamentId, tournamentId))
    .orderBy(sql`COALESCE(${golfers.worldRanking}, 9999)`, golfers.lastName, golfers.firstName);

  // If game context provided, mark which golfers are already used
  if (options?.gameId && options?.userId) {
    const used = await db
      .select({ golferId: usedGolfers.golferId })
      .from(usedGolfers)
      .where(
        and(
          eq(usedGolfers.gameId, options.gameId),
          eq(usedGolfers.userId, options.userId)
        )
      );

    const usedSet = new Set(used.map((u) => u.golferId));
    return fieldEntries.map((entry) => ({
      ...entry,
      isUsed: usedSet.has(entry.golferId),
    }));
  }

  return fieldEntries.map((entry) => ({ ...entry, isUsed: false }));
}
