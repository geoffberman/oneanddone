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
import { eq, and } from "drizzle-orm";
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
