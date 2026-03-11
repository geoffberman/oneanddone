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

  // Step 1 — deduplicate by normalized name.
  // The same PGA Tour event sometimes has two DB rows with different IDs
  // (e.g. "Arnold Palmer Invitational" vs "Arnold Palmer Invitational
  // presented by Mastercard"). Strip sponsor suffixes and leading "The"
  // before comparing so those collapse to one entry. Keep the row with the
  // highest purse; fall back to whichever comes first if purses are equal.
  const normalizeForDedup = (name: string) =>
    name
      .replace(/^the\s+/i, "")
      .replace(/\s+(presented|powered|sponsored)\s+by\s+.*/i, "")
      .trim()
      .toLowerCase();

  const byNorm = new Map<string, (typeof rows)[0]>();
  for (const t of rows) {
    const norm = normalizeForDedup(t.name);
    const existing = byNorm.get(norm);
    if (!existing) {
      byNorm.set(norm, t);
    } else {
      const tPurse = parseFloat(t.purse ?? "0") || 0;
      const exPurse = parseFloat(existing.purse ?? "0") || 0;
      if (tPurse > exPurse) byNorm.set(norm, t);
    }
  }
  const deduped = [...byNorm.values()].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  );

  // Step 2 — remove secondary events on the same start date.
  // When the PGA Tour runs an opposite-field event the same week as a major
  // or flagship event, the secondary event has a meaningfully lower purse.
  // Keep only the highest-purse tournament per start date; if two events
  // share a date and one has zero/null purse, keep the one with a purse.
  // If neither has a purse (or they're equal), keep both.
  const byDate = new Map<string, (typeof deduped)[0]>();
  const secondaryIds = new Set<number>();
  for (const t of deduped) {
    const day = t.startDate.toISOString().slice(0, 10);
    const existing = byDate.get(day);
    if (!existing) {
      byDate.set(day, t);
    } else {
      const tPurse = parseFloat(t.purse ?? "0") || 0;
      const exPurse = parseFloat(existing.purse ?? "0") || 0;
      if (tPurse === exPurse) {
        // Can't determine which is secondary; keep both
        continue;
      }
      if (tPurse > exPurse) {
        secondaryIds.add(existing.id);
        byDate.set(day, t);
      } else {
        secondaryIds.add(t.id);
      }
    }
  }
  return deduped.filter((t) => !secondaryIds.has(t.id));
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
