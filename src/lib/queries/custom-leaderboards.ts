import { db } from "@/db";
import {
  customLeaderboards,
  customLeaderboardMembers,
  customLeaderboardShares,
  users,
} from "@/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";

export interface CustomLeaderboardSummary {
  id: number;
  name: string;
  ownerId: string;
  memberCount: number;
  isOwner: boolean;
  shares: { userId: string; userName: string | null; userEmail: string | null }[];
}

export async function getCustomLeaderboards(
  gameId: number,
  userId: string
): Promise<CustomLeaderboardSummary[]> {
  // Leaderboards the user owns or that are shared with them
  const lbs = await db
    .selectDistinct({
      id: customLeaderboards.id,
      name: customLeaderboards.name,
      ownerId: customLeaderboards.ownerId,
    })
    .from(customLeaderboards)
    .leftJoin(
      customLeaderboardShares,
      eq(customLeaderboardShares.customLeaderboardId, customLeaderboards.id)
    )
    .where(
      and(
        eq(customLeaderboards.gameId, gameId),
        or(
          eq(customLeaderboards.ownerId, userId),
          eq(customLeaderboardShares.sharedWithUserId, userId)
        )
      )
    );

  if (lbs.length === 0) return [];

  const ids = lbs.map((lb) => lb.id);

  const [memberRows, shares] = await Promise.all([
    db
      .select({ customLeaderboardId: customLeaderboardMembers.customLeaderboardId })
      .from(customLeaderboardMembers)
      .where(inArray(customLeaderboardMembers.customLeaderboardId, ids)),

    db
      .select({
        customLeaderboardId: customLeaderboardShares.customLeaderboardId,
        userId: customLeaderboardShares.sharedWithUserId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(customLeaderboardShares)
      .innerJoin(users, eq(customLeaderboardShares.sharedWithUserId, users.id))
      .where(inArray(customLeaderboardShares.customLeaderboardId, ids)),
  ]);

  const memberCountMap: Record<number, number> = {};
  for (const row of memberRows) {
    const lbId = row.customLeaderboardId as number;
    memberCountMap[lbId] = (memberCountMap[lbId] ?? 0) + 1;
  }

  const sharesMap: Record<
    number,
    { userId: string; userName: string | null; userEmail: string | null }[]
  > = {};
  for (const row of shares) {
    const lbId = row.customLeaderboardId as number;
    if (!sharesMap[lbId]) sharesMap[lbId] = [];
    sharesMap[lbId].push({
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
    });
  }

  return lbs.map((lb) => ({
    ...lb,
    memberCount: memberCountMap[lb.id] ?? 0,
    isOwner: lb.ownerId === userId,
    shares: sharesMap[lb.id] ?? [],
  }));
}
