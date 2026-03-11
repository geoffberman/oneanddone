import { db } from "@/db";
import {
  tournaments,
  tournamentFields,
  golfers,
  usedGolfers,
  seasons,
} from "@/db/schema";
import { eq, and, gte, lte, asc, desc, sql } from "drizzle-orm";

export async function getCurrentTournament() {
  const now = new Date();

  // 1. Actively in-progress tournament (set by sync-results cron)
  const [inProgress] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.isInProgress, true))
    .limit(1);

  if (inProgress) return inProgress;

  // 2. Tournament that started within the past 6 days (covers the full tournament
  //    week, including today before the cron marks it in-progress, and the 6-hour
  //    cooldown after it ends). We approximate the end as startDate + 4 days + 6h.
  const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select()
    .from(tournaments)
    .where(
      and(
        lte(tournaments.startDate, now),        // already started
        gte(tournaments.startDate, sixDaysAgo), // started within past 6 days
        eq(tournaments.canceled, false)
      )
    )
    .orderBy(desc(tournaments.startDate))
    .limit(1);

  if (recent) {
    // Keep showing this tournament until ~6 hours after its approximate end
    const approxEnd = new Date(
      new Date(recent.startDate).getTime() + (4 * 24 + 6) * 60 * 60 * 1000
    );
    if (now <= approxEnd) return recent;
  }

  // 3. Next upcoming tournament
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
  const rows = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.seasonId, seasonId))
    .orderBy(asc(tournaments.startDate));

  // Deduplicate by start date — the same PGA Tour event sometimes has two DB
  // rows with different IDs and slightly different names (e.g. "Arnold Palmer
  // Invitational" vs "Arnold Palmer Invitational presented by Mastercard").
  // Each event occupies a unique week so same start day = same tournament.
  const seen = new Set<string>();
  return rows.filter((t) => {
    const day = new Date(t.startDate).toISOString().slice(0, 10);
    if (seen.has(day)) return false;
    seen.add(day);
    return true;
  });
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
