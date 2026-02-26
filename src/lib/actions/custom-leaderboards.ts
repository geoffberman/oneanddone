"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  customLeaderboards,
  customLeaderboardMembers,
  customLeaderboardShares,
  gameMembers,
  users,
} from "@/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function assertMembership(gameId: number, userId: string) {
  const [row] = await db
    .select({ id: gameMembers.id })
    .from(gameMembers)
    .where(and(eq(gameMembers.gameId, gameId), eq(gameMembers.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Not a member of this game");
}

async function assertOwner(customLeaderboardId: number, userId: string) {
  const [row] = await db
    .select({ id: customLeaderboards.id })
    .from(customLeaderboards)
    .where(
      and(
        eq(customLeaderboards.id, customLeaderboardId),
        eq(customLeaderboards.ownerId, userId)
      )
    )
    .limit(1);
  if (!row) throw new Error("Not the owner of this leaderboard");
}

// ─── queries ──────────────────────────────────────────────────────────────────

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

  // Count members per leaderboard
  const memberCountMap: Record<number, number> = {};
  for (const row of memberRows) {
    const lbId = row.customLeaderboardId as number;
    memberCountMap[lbId] = (memberCountMap[lbId] ?? 0) + 1;
  }

  // Group shares per leaderboard
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

export async function getCustomLeaderboardById(customLeaderboardId: number) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const userId = session.user.id;

  const [lb] = await db
    .select()
    .from(customLeaderboards)
    .where(eq(customLeaderboards.id, customLeaderboardId))
    .limit(1);
  if (!lb) return null;

  // Check access: owner or shared with user
  const isOwner = lb.ownerId === userId;
  if (!isOwner) {
    const [share] = await db
      .select({ id: customLeaderboardShares.id })
      .from(customLeaderboardShares)
      .where(
        and(
          eq(customLeaderboardShares.customLeaderboardId, customLeaderboardId),
          eq(customLeaderboardShares.sharedWithUserId, userId)
        )
      )
      .limit(1);
    if (!share) return null; // no access
  }

  const memberRows = await db
    .select({ userId: customLeaderboardMembers.userId })
    .from(customLeaderboardMembers)
    .where(
      eq(customLeaderboardMembers.customLeaderboardId, customLeaderboardId)
    );

  return {
    ...lb,
    isOwner,
    memberUserIds: memberRows.map((r) => r.userId),
  };
}

// ─── mutations ────────────────────────────────────────────────────────────────

export async function createCustomLeaderboard(
  gameId: number,
  name: string,
  memberUserIds: string[]
): Promise<{ id: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const userId = session.user.id;

  await assertMembership(gameId, userId);

  if (!name.trim()) throw new Error("Name is required");
  if (memberUserIds.length === 0)
    throw new Error("Select at least one member");

  const [lb] = await db
    .insert(customLeaderboards)
    .values({ gameId, ownerId: userId, name: name.trim() })
    .returning({ id: customLeaderboards.id });

  if (memberUserIds.length > 0) {
    await db.insert(customLeaderboardMembers).values(
      memberUserIds.map((uid) => ({
        customLeaderboardId: lb.id,
        userId: uid,
      }))
    );
  }

  revalidatePath(`/games/${gameId}/leaderboard/custom`);
  return { id: lb.id };
}

export async function updateCustomLeaderboard(
  customLeaderboardId: number,
  name: string,
  memberUserIds: string[]
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await assertOwner(customLeaderboardId, session.user.id);

  if (!name.trim()) throw new Error("Name is required");

  const [lb] = await db
    .select({ gameId: customLeaderboards.gameId })
    .from(customLeaderboards)
    .where(eq(customLeaderboards.id, customLeaderboardId))
    .limit(1);

  await db
    .update(customLeaderboards)
    .set({ name: name.trim() })
    .where(eq(customLeaderboards.id, customLeaderboardId));

  // Replace members
  await db
    .delete(customLeaderboardMembers)
    .where(
      eq(customLeaderboardMembers.customLeaderboardId, customLeaderboardId)
    );
  if (memberUserIds.length > 0) {
    await db.insert(customLeaderboardMembers).values(
      memberUserIds.map((uid) => ({
        customLeaderboardId,
        userId: uid,
      }))
    );
  }

  revalidatePath(`/games/${lb.gameId}/leaderboard/custom`);
  revalidatePath(`/games/${lb.gameId}/leaderboard/custom/${customLeaderboardId}`);
}

export async function deleteCustomLeaderboard(
  customLeaderboardId: number
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await assertOwner(customLeaderboardId, session.user.id);

  const [lb] = await db
    .select({ gameId: customLeaderboards.gameId })
    .from(customLeaderboards)
    .where(eq(customLeaderboards.id, customLeaderboardId))
    .limit(1);

  await db
    .delete(customLeaderboards)
    .where(eq(customLeaderboards.id, customLeaderboardId));

  revalidatePath(`/games/${lb?.gameId}/leaderboard/custom`);
}

export async function shareCustomLeaderboard(
  customLeaderboardId: number,
  email: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Not authenticated");
    await assertOwner(customLeaderboardId, session.user.id);

    // Look up user by email
    const [targetUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);
    if (!targetUser) return { success: false, error: "No user found with that email" };
    if (targetUser.id === session.user.id)
      return { success: false, error: "You can't share with yourself" };

    // Check they're in the same game
    const [lb] = await db
      .select({ gameId: customLeaderboards.gameId })
      .from(customLeaderboards)
      .where(eq(customLeaderboards.id, customLeaderboardId))
      .limit(1);
    if (!lb) return { success: false, error: "Leaderboard not found" };

    const [membership] = await db
      .select({ id: gameMembers.id })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, lb.gameId),
          eq(gameMembers.userId, targetUser.id)
        )
      )
      .limit(1);
    if (!membership)
      return { success: false, error: "That user is not in this pool" };

    // Upsert share (ignore duplicate)
    await db
      .insert(customLeaderboardShares)
      .values({ customLeaderboardId, sharedWithUserId: targetUser.id })
      .onConflictDoNothing();

    revalidatePath(`/games/${lb.gameId}/leaderboard/custom`);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to share",
    };
  }
}

export async function removeShare(
  customLeaderboardId: number,
  sharedWithUserId: string
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await assertOwner(customLeaderboardId, session.user.id);

  const [lb] = await db
    .select({ gameId: customLeaderboards.gameId })
    .from(customLeaderboards)
    .where(eq(customLeaderboards.id, customLeaderboardId))
    .limit(1);

  await db
    .delete(customLeaderboardShares)
    .where(
      and(
        eq(customLeaderboardShares.customLeaderboardId, customLeaderboardId),
        eq(customLeaderboardShares.sharedWithUserId, sharedWithUserId)
      )
    );

  revalidatePath(`/games/${lb?.gameId}/leaderboard/custom`);
}
