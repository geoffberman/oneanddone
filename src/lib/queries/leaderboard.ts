import { db } from "@/db";
import {
  picks,
  users,
  gameMembers,
  subGameTournaments,
  golfers,
  tournaments,
} from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

export interface LeaderboardEntry {
  userId: string;
  userName: string | null;
  userImage: string | null;
  totalEarnings: string;
  pickCount: number;
  rank: number;
}

export async function getSeasonLeaderboard(
  gameId: number
): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: picks.userId,
      userName: users.name,
      userImage: users.image,
      totalEarnings: sql<string>`COALESCE(SUM(CAST(${picks.earnings} AS NUMERIC)), 0)::text`,
      pickCount: sql<number>`COUNT(${picks.id})::int`,
    })
    .from(picks)
    .innerJoin(users, eq(picks.userId, users.id))
    .where(eq(picks.gameId, gameId))
    .groupBy(picks.userId, users.name, users.image)
    .orderBy(
      sql`COALESCE(SUM(CAST(${picks.earnings} AS NUMERIC)), 0) DESC`
    );

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

export async function getSubGameLeaderboard(
  gameId: number,
  subGameId: number
): Promise<LeaderboardEntry[]> {
  // Get tournament IDs for this sub-game
  const subGameTourns = await db
    .select({ tournamentId: subGameTournaments.tournamentId })
    .from(subGameTournaments)
    .where(eq(subGameTournaments.subGameId, subGameId));

  const tournamentIds = subGameTourns.map((t) => t.tournamentId);
  if (tournamentIds.length === 0) return [];

  const rows = await db
    .select({
      userId: picks.userId,
      userName: users.name,
      userImage: users.image,
      totalEarnings: sql<string>`COALESCE(SUM(CAST(${picks.earnings} AS NUMERIC)), 0)::text`,
      pickCount: sql<number>`COUNT(${picks.id})::int`,
    })
    .from(picks)
    .innerJoin(users, eq(picks.userId, users.id))
    .where(
      and(eq(picks.gameId, gameId), inArray(picks.tournamentId, tournamentIds))
    )
    .groupBy(picks.userId, users.name, users.image)
    .orderBy(
      sql`COALESCE(SUM(CAST(${picks.earnings} AS NUMERIC)), 0) DESC`
    );

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

export interface PickHistoryEntry {
  pickId: number;
  tournamentId: number;
  tournamentName: string;
  tournamentStartDate: Date;
  primaryGolferName: string;
  alternateGolferName: string | null;
  activeGolferName: string | null;
  alternateActivated: boolean;
  earnings: string;
  isOver: boolean;
}

export async function getPickHistory(
  gameId: number,
  userId: string
): Promise<PickHistoryEntry[]> {
  const primaryGolfer = db
    .select({
      id: golfers.id,
      name: sql<string>`${golfers.firstName} || ' ' || ${golfers.lastName}`,
    })
    .from(golfers)
    .as("primaryGolfer");

  const rows = await db
    .select({
      pickId: picks.id,
      tournamentId: picks.tournamentId,
      tournamentName: tournaments.name,
      tournamentStartDate: tournaments.startDate,
      primaryGolferId: picks.primaryGolferId,
      alternateGolferId: picks.alternateGolferId,
      activeGolferId: picks.activeGolferId,
      alternateActivated: picks.alternateActivated,
      earnings: picks.earnings,
      isOver: tournaments.isOver,
    })
    .from(picks)
    .innerJoin(tournaments, eq(picks.tournamentId, tournaments.id))
    .where(and(eq(picks.gameId, gameId), eq(picks.userId, userId)))
    .orderBy(tournaments.startDate);

  // Fetch golfer names for all picks
  const golferIds = new Set<number>();
  for (const row of rows) {
    golferIds.add(row.primaryGolferId);
    if (row.alternateGolferId) golferIds.add(row.alternateGolferId);
    if (row.activeGolferId) golferIds.add(row.activeGolferId);
  }

  const golferList =
    golferIds.size > 0
      ? await db
          .select()
          .from(golfers)
          .where(inArray(golfers.id, Array.from(golferIds)))
      : [];

  const golferMap = new Map(golferList.map((g) => [g.id, g]));
  const getName = (id: number | null) => {
    if (!id) return null;
    const g = golferMap.get(id);
    return g ? `${g.firstName} ${g.lastName}` : null;
  };

  return rows.map((row) => ({
    pickId: row.pickId,
    tournamentId: row.tournamentId,
    tournamentName: row.tournamentName,
    tournamentStartDate: row.tournamentStartDate,
    primaryGolferName: getName(row.primaryGolferId) || "Unknown",
    alternateGolferName: getName(row.alternateGolferId),
    activeGolferName: getName(row.activeGolferId),
    alternateActivated: row.alternateActivated,
    earnings: row.earnings || "0",
    isOver: row.isOver,
  }));
}
