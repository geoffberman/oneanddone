import { db } from "@/db";
import {
  picks,
  users,
  gameMembers,
  subGameTournaments,
  golfers,
  tournaments,
  tournamentResults,
} from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// Prefer displayName over name for leaderboard display
const displayName = sql<string | null>`COALESCE(${users.displayName}, ${users.name})`;

export interface LeaderboardEntry {
  userId: string;
  userName: string | null;
  userImage: string | null;
  totalEarnings: string;
  // Cached earnings for just the current tournament (used to subtract before adding live earnings)
  currentTournamentEarnings?: string;
  pickCount: number;
  rank: number;
  hasCurrentPick?: boolean;            // whether user has a pick for the current tournament
  currentPickName?: string | null;     // set only after picks are locked
  currentPickIsAlternate?: boolean;
  // Live tournament data (set when a tournament is in progress or just finished)
  livePosition?: number | null;
  liveIsTied?: boolean;
  liveTiedCount?: number;              // how many players share this position (for payout calc)
  liveTotalScoreToPar?: number | null;
  liveMadeCut?: boolean | null;
  liveIsWithdrawn?: boolean | null;
  liveRounds?: number | null;
}

// Returns a Set of userIds who have submitted a pick for a given tournament.
export async function getUsersWithPickForTournament(
  gameId: number,
  tournamentId: number
): Promise<Set<string>> {
  const rows = await db
    .select({ userId: picks.userId })
    .from(picks)
    .where(and(eq(picks.gameId, gameId), eq(picks.tournamentId, tournamentId)));
  return new Set(rows.map((r) => r.userId));
}

// Returns each user's locked-in golfer for a specific tournament.
// Uses activeGolferId when set (resolve-picks has run), otherwise primaryGolferId.
export async function getCurrentTournamentPickNames(
  gameId: number,
  tournamentId: number
): Promise<Map<string, { name: string; isAlternate: boolean }>> {
  const rows = await db
    .select({
      userId: picks.userId,
      primaryGolferId: picks.primaryGolferId,
      activeGolferId: picks.activeGolferId,
      alternateActivated: picks.alternateActivated,
    })
    .from(picks)
    .where(and(eq(picks.gameId, gameId), eq(picks.tournamentId, tournamentId)));

  if (rows.length === 0) return new Map();

  const golferIds = [
    ...new Set(
      rows.flatMap((r) =>
        [r.primaryGolferId, r.activeGolferId].filter((id): id is number => id !== null)
      )
    ),
  ];

  const golferRows = await db
    .select({ id: golfers.id, firstName: golfers.firstName, lastName: golfers.lastName })
    .from(golfers)
    .where(inArray(golfers.id, golferIds));

  const golferMap = new Map(
    golferRows.map((g) => [g.id, `${g.firstName} ${g.lastName}`])
  );

  const result = new Map<string, { name: string; isAlternate: boolean }>();
  for (const row of rows) {
    const displayId = row.activeGolferId ?? row.primaryGolferId;
    const name = golferMap.get(displayId) ?? null;
    if (name) {
      result.set(row.userId, {
        name,
        isAlternate: row.alternateActivated,
      });
    }
  }
  return result;
}

export async function getSeasonLeaderboard(
  gameId: number,
  options?: { currentTournamentId?: number }
): Promise<LeaderboardEntry[]> {
  const tid = options?.currentTournamentId;
  // Start from gameMembers so ALL pool members appear, even those with no picks yet.
  const rows = await db
    .select({
      userId: gameMembers.userId,
      userName: displayName,
      userImage: users.image,
      totalEarnings: sql<string>`COALESCE(SUM(CAST(${picks.earnings} AS NUMERIC)), 0)::text`,
      // Isolated earnings for just the current tournament, so callers can replace
      // cached earnings with real-time live earnings without a second query.
      currentTournamentEarnings: tid != null
        ? sql<string>`COALESCE(SUM(CASE WHEN ${picks.tournamentId} = ${tid} THEN CAST(${picks.earnings} AS NUMERIC) ELSE 0 END), 0)::text`
        : sql<string>`'0'::text`,
      pickCount: sql<number>`COUNT(${picks.id})::int`,
    })
    .from(gameMembers)
    .innerJoin(users, eq(gameMembers.userId, users.id))
    .leftJoin(picks, and(eq(picks.gameId, gameMembers.gameId), eq(picks.userId, gameMembers.userId)))
    .where(eq(gameMembers.gameId, gameId))
    .groupBy(gameMembers.userId, users.displayName, users.name, users.image)
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
      userName: displayName,
      userImage: users.image,
      totalEarnings: sql<string>`COALESCE(SUM(CAST(${picks.earnings} AS NUMERIC)), 0)::text`,
      pickCount: sql<number>`COUNT(${picks.id})::int`,
    })
    .from(picks)
    .innerJoin(users, eq(picks.userId, users.id))
    .where(
      and(eq(picks.gameId, gameId), inArray(picks.tournamentId, tournamentIds))
    )
    .groupBy(picks.userId, users.displayName, users.name, users.image)
    .orderBy(
      sql`COALESCE(SUM(CAST(${picks.earnings} AS NUMERIC)), 0) DESC`
    );

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

export async function getWeeklyLeaderboard(
  gameId: number,
  tournamentId: number
): Promise<LeaderboardEntry[]> {
  // Start from gameMembers so ALL pool members appear (with pick status indicator).
  const rows = await db
    .select({
      userId: gameMembers.userId,
      userName: displayName,
      userImage: users.image,
      totalEarnings: sql<string>`COALESCE(CAST(${picks.earnings} AS NUMERIC), 0)::text`,
      pickCount: sql<number>`CASE WHEN ${picks.id} IS NOT NULL THEN 1 ELSE 0 END::int`,
    })
    .from(gameMembers)
    .innerJoin(users, eq(gameMembers.userId, users.id))
    .leftJoin(picks, and(
      eq(picks.gameId, gameMembers.gameId),
      eq(picks.userId, gameMembers.userId),
      eq(picks.tournamentId, tournamentId)
    ))
    .where(eq(gameMembers.gameId, gameId))
    .orderBy(sql`COALESCE(CAST(${picks.earnings} AS NUMERIC), 0) DESC`);

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
  isInProgress: boolean;
  // Live score data (populated for in-progress tournaments)
  livePosition: number | null;
  liveTotalScoreToPar: number | null;
  liveMadeCut: boolean | null;
  liveIsWithdrawn: boolean | null;
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
      isInProgress: tournaments.isInProgress,
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

  // Fetch live scores for in-progress picks
  const inProgressRows = rows.filter((r) => r.isInProgress);
  const liveScoreMap = new Map<number, {
    position: number | null;
    totalScoreToPar: number | null;
    madeCut: boolean | null;
    isWithdrawn: boolean | null;
  }>();

  if (inProgressRows.length > 0) {
    const liveResults = await db
      .select({
        tournamentId: tournamentResults.tournamentId,
        golferId: tournamentResults.golferId,
        position: tournamentResults.position,
        totalScoreToPar: tournamentResults.totalScoreToPar,
        madeCut: tournamentResults.madeCut,
        isWithdrawn: tournamentResults.isWithdrawn,
      })
      .from(tournamentResults)
      .where(
        and(
          inArray(tournamentResults.tournamentId, [...new Set(inProgressRows.map((r) => r.tournamentId))]),
          inArray(
            tournamentResults.golferId,
            [...new Set(inProgressRows.map((r) => r.activeGolferId ?? r.primaryGolferId))]
          )
        )
      );

    for (const row of inProgressRows) {
      const effectiveId = row.activeGolferId ?? row.primaryGolferId;
      const result = liveResults.find(
        (r) => r.tournamentId === row.tournamentId && r.golferId === effectiveId
      );
      if (result) liveScoreMap.set(row.pickId, result);
    }
  }

  return rows.map((row) => {
    const live = liveScoreMap.get(row.pickId);
    return {
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
      isInProgress: row.isInProgress,
      livePosition: live?.position ?? null,
      liveTotalScoreToPar: live?.totalScoreToPar ?? null,
      liveMadeCut: live?.madeCut ?? null,
      liveIsWithdrawn: live?.isWithdrawn ?? null,
    };
  });
}

// Returns a map of userId → live tournament result for each member's active golfer.
// Uses SQL RANK() to compute positions from actual scores rather than relying on
// the API's Rank field which can be stale at tournament start.
export async function getLiveScoresForGame(
  gameId: number,
  tournamentId: number
): Promise<Map<string, {
  position: number | null;
  isTied: boolean;
  tiedCount: number;
  totalScoreToPar: number | null;
  madeCut: boolean | null;
  isWithdrawn: boolean | null;
  rounds: number | null;
  earnings: string | null;
}>> {
  const gamePicks = await db
    .select({
      userId: picks.userId,
      primaryGolferId: picks.primaryGolferId,
      activeGolferId: picks.activeGolferId,
    })
    .from(picks)
    .where(and(eq(picks.gameId, gameId), eq(picks.tournamentId, tournamentId)));

  if (gamePicks.length === 0) return new Map();

  const effectiveIds = [
    ...new Set(gamePicks.map((p) => p.activeGolferId ?? p.primaryGolferId)),
  ];

  // Fetch all tournament results and compute positions from scores using RANK().
  // This avoids relying on the API's Rank field which may not reflect live scores.
  const allResults = await db
    .select({
      golferId: tournamentResults.golferId,
      totalScoreToPar: tournamentResults.totalScoreToPar,
      madeCut: tournamentResults.madeCut,
      isWithdrawn: tournamentResults.isWithdrawn,
      rounds: tournamentResults.rounds,
      earnings: tournamentResults.earnings,
      computedPosition: sql<number>`RANK() OVER (
        ORDER BY
          CASE WHEN ${tournamentResults.isWithdrawn} THEN 1 ELSE 0 END,
          ${tournamentResults.totalScoreToPar} ASC NULLS LAST
      )`,
    })
    .from(tournamentResults)
    .where(eq(tournamentResults.tournamentId, tournamentId));

  // Count how many players share each computed position to determine ties
  const positionCounts = new Map<number, number>();
  for (const r of allResults) {
    if (r.computedPosition != null) {
      positionCounts.set(r.computedPosition, (positionCounts.get(r.computedPosition) || 0) + 1);
    }
  }

  const resultMap = new Map(allResults.map((r) => [r.golferId, r]));
  const out = new Map<string, {
    position: number | null;
    isTied: boolean;
    tiedCount: number;
    totalScoreToPar: number | null;
    madeCut: boolean | null;
    isWithdrawn: boolean | null;
    rounds: number | null;
    earnings: string | null;
  }>();

  for (const pick of gamePicks) {
    const effectiveId = pick.activeGolferId ?? pick.primaryGolferId;
    const result = resultMap.get(effectiveId);
    if (result) {
      const pos = result.computedPosition;
      const count = pos != null ? (positionCounts.get(pos) || 1) : 1;
      out.set(pick.userId, {
        position: pos ?? null,
        isTied: count > 1,
        tiedCount: count,
        totalScoreToPar: result.totalScoreToPar,
        madeCut: result.madeCut,
        isWithdrawn: result.isWithdrawn,
        rounds: result.rounds,
        earnings: result.earnings,
      });
    }
  }

  return out;
}
