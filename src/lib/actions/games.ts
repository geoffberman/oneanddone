"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { games, gameMembers, seasons, users, passwordResetTokens, picks, usedGolfers, tournaments } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { generateInviteCode } from "@/lib/utils/invite-code";
import { sendMemberAddedEmail, sendInviteEmail, sendPasswordResetEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export async function createGame(name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  // Get the latest season
  const [season] = await db
    .select({ id: seasons.id, year: seasons.year })
    .from(seasons)
    .orderBy(desc(seasons.year))
    .limit(1);

  if (!season) throw new Error("No season found. Please sync data first.");

  const inviteCode = generateInviteCode();

  const now = new Date();
  const [game] = await db
    .insert(games)
    .values({
      name,
      seasonId: season.id,
      createdBy: session.user.id,
      inviteCode,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: games.id,
      name: games.name,
      inviteCode: games.inviteCode,
    });

  // Add creator as a manager
  await db.insert(gameMembers).values({
    gameId: game.id,
    userId: session.user.id,
    role: "manager",
    joinedAt: now,
  });

  revalidatePath("/dashboard");
  return game;
}

export async function joinGame(inviteCode: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      inviteCode: games.inviteCode,
      isActive: games.isActive,
    })
    .from(games)
    .where(
      and(
        eq(games.inviteCode, inviteCode.toUpperCase()),
        eq(games.isActive, true)
      )
    )
    .limit(1);

  if (!game) throw new Error("Invalid invite code or game is not active");

  // Check if already a member
  const [existing] = await db
    .select({ id: gameMembers.id })
    .from(gameMembers)
    .where(
      and(
        eq(gameMembers.gameId, game.id),
        eq(gameMembers.userId, session.user.id)
      )
    )
    .limit(1);

  if (existing) throw new Error("You are already a member of this game");

  await db.insert(gameMembers).values({
    gameId: game.id,
    userId: session.user.id,
    role: "player",
    joinedAt: new Date(),
  });

  revalidatePath("/dashboard");
  return game;
}

export async function getUserGames() {
  const session = await auth();
  if (!session?.user?.id) return [];

  const userGames = await db
    .select({
      gameId: games.id,
      gameName: games.name,
      inviteCode: games.inviteCode,
      seasonYear: seasons.year,
      role: gameMembers.role,
    })
    .from(gameMembers)
    .innerJoin(games, eq(gameMembers.gameId, games.id))
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .where(
      and(
        eq(gameMembers.userId, session.user.id),
        eq(games.isActive, true)
      )
    );

  return userGames;
}

export async function updateGameRules(gameId: number, rules: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const [membership] = await db
    .select({ id: gameMembers.id })
    .from(gameMembers)
    .where(
      and(
        eq(gameMembers.gameId, gameId),
        eq(gameMembers.userId, session.user.id),
        eq(gameMembers.role, "manager")
      )
    )
    .limit(1);

  if (!membership) throw new Error("Only league managers can update rules");

  await db
    .update(games)
    .set({ rules: rules.trim() || null, updatedAt: new Date() })
    .where(eq(games.id, gameId));

  revalidatePath(`/games/${gameId}`);
}

export async function updateGameName(gameId: number, name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Game name cannot be empty");

  const [membership] = await db
    .select({ id: gameMembers.id })
    .from(gameMembers)
    .where(
      and(
        eq(gameMembers.gameId, gameId),
        eq(gameMembers.userId, session.user.id),
        eq(gameMembers.role, "manager")
      )
    )
    .limit(1);

  if (!membership) throw new Error("Only league managers can rename the game");

  await db
    .update(games)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(games.id, gameId));

  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/games/${gameId}/settings`);
}

export async function addMemberByEmail(
  gameId: number,
  email: string
): Promise<{ success: true; name: string | null; created?: boolean } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Not authenticated" };

    const normalizedEmail = email.toLowerCase().trim();

    // Verify caller is a manager
    const [membership] = await db
      .select({ id: gameMembers.id })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, session.user.id),
          eq(gameMembers.role, "manager")
        )
      )
      .limit(1);

    if (!membership)
      return { success: false, error: "Only league managers can add members" };

    // Get game name for the email
    const [game] = await db
      .select({ name: games.name })
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    const addedByName = session.user.name || "A league manager";
    const gameName = game?.name || "a league";

    // Find user by email — or create an account for them
    let [targetUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    let isNewUser = false;

    if (!targetUser) {
      // Create a new account (no password — they'll set one via the invite link)
      const newUserId = crypto.randomUUID();
      await db.insert(users).values({
        id: newUserId,
        email: normalizedEmail,
        createdAt: new Date(),
      });
      targetUser = { id: newUserId, name: null };
      isNewUser = true;
    }

    // Check if already a member
    const [existing] = await db
      .select({ id: gameMembers.id })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, targetUser.id)
        )
      )
      .limit(1);

    if (existing)
      return { success: false, error: "This person is already a member" };

    // Add as player
    await db.insert(gameMembers).values({
      gameId,
      userId: targetUser.id,
      role: "player",
      joinedAt: new Date(),
    });

    // Send appropriate email (fire and forget)
    if (isNewUser) {
      // Ensure password_reset_tokens table exists
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
          "id" text PRIMARY KEY NOT NULL,
          "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "token" text NOT NULL UNIQUE,
          "expires_at" timestamp NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL
        )
      `);

      // Generate a password-setup token (24 hour expiry for new invites)
      const token = crypto.randomBytes(32).toString("hex");
      await db.insert(passwordResetTokens).values({
        id: crypto.randomUUID(),
        userId: targetUser.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const baseUrl =
        process.env.NEXTAUTH_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000");
      const setupUrl = `${baseUrl}/reset-password?token=${token}`;

      sendInviteEmail(normalizedEmail, gameName, addedByName, setupUrl).catch(
        (err) => console.error("[AddMember] Invite email error:", err)
      );
    } else {
      sendMemberAddedEmail(normalizedEmail, gameName, addedByName).catch(
        (err) => console.error("[AddMember] Email error:", err)
      );
    }

    revalidatePath(`/games/${gameId}/members`);
    return { success: true, name: targetUser.name, created: isNewUser };
  } catch (err) {
    console.error("[AddMember] Unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    };
  }
}

export async function updateUserProfile(displayName: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("Display name cannot be empty");

  await db
    .update(users)
    .set({ displayName: trimmed })
    .where(eq(users.id, session.user.id));

  revalidatePath("/", "layout"); // flush all pages so leaderboard reflects the new name
}

export async function removeMember(
  gameId: number,
  targetUserId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Not authenticated" };

    // Verify caller is a manager of this game
    const [membership] = await db
      .select({ id: gameMembers.id })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, session.user.id),
          eq(gameMembers.role, "manager")
        )
      )
      .limit(1);

    if (!membership)
      return { success: false, error: "Only league managers can remove members" };

    // Prevent manager from removing themselves
    if (targetUserId === session.user.id)
      return { success: false, error: "You cannot remove yourself from the game" };

    // Verify target is a member and is a player (not a manager)
    const [targetMembership] = await db
      .select({ id: gameMembers.id, role: gameMembers.role })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (!targetMembership)
      return { success: false, error: "This person is not a member of the game" };

    if (targetMembership.role === "manager")
      return { success: false, error: "Cannot remove a manager" };

    // Delete picks, usedGolfers, and membership sequentially
    // (Neon HTTP driver does not support transactions)
    await db
      .delete(picks)
      .where(and(eq(picks.gameId, gameId), eq(picks.userId, targetUserId)));
    await db
      .delete(usedGolfers)
      .where(and(eq(usedGolfers.gameId, gameId), eq(usedGolfers.userId, targetUserId)));
    await db
      .delete(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, targetUserId)
        )
      );

    revalidatePath(`/games/${gameId}/members`);
    revalidatePath(`/games/${gameId}/leaderboard`);
    return { success: true };
  } catch (err) {
    console.error("[RemoveMember] Unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    };
  }
}

export async function sendMemberPasswordReset(
  gameId: number,
  targetUserId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Not authenticated" };

    // Verify caller is a manager of this game
    const [membership] = await db
      .select({ id: gameMembers.id })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, session.user.id),
          eq(gameMembers.role, "manager")
        )
      )
      .limit(1);

    if (!membership)
      return { success: false, error: "Only league managers can reset passwords" };

    // Verify target is a member of this game
    const [targetMembership] = await db
      .select({ id: gameMembers.id })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (!targetMembership)
      return { success: false, error: "This person is not a member of the game" };

    // Get target user's email
    const [targetUser] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser?.email)
      return { success: false, error: "User has no email address on file" };

    // Delete any existing tokens for this user
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, targetUserId));

    // Generate a new token (1 hour expiry)
    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(passwordResetTokens).values({
      id: crypto.randomUUID(),
      userId: targetUserId,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    const emailSent = await sendPasswordResetEmail(targetUser.email, resetUrl);
    if (!emailSent) {
      console.log(`[MemberPasswordReset] ${targetUser.email}: ${resetUrl}`);
    }

    return { success: true };
  } catch (err) {
    console.error("[MemberPasswordReset] Unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    };
  }
}

export async function setMemberPassword(
  gameId: number,
  targetUserId: string,
  newPassword: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Not authenticated" };

    // Verify caller is a manager of this game
    const [membership] = await db
      .select({ id: gameMembers.id })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, session.user.id),
          eq(gameMembers.role, "manager")
        )
      )
      .limit(1);

    if (!membership)
      return { success: false, error: "Only league managers can set member passwords" };

    // Verify target is a member of this game
    const [targetMembership] = await db
      .select({ id: gameMembers.id })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (!targetMembership)
      return { success: false, error: "This person is not a member of the game" };

    if (newPassword.length < 8)
      return { success: false, error: "Password must be at least 8 characters" };

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, targetUserId));

    // Invalidate any existing reset tokens for this user
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, targetUserId));

    return { success: true };
  } catch (err) {
    console.error("[SetMemberPassword] Unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    };
  }
}

export async function setMemberDisplayName(
  gameId: number,
  targetUserId: string,
  displayName: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Not authenticated" };

    // Verify caller is a manager of this game
    const [membership] = await db
      .select({ id: gameMembers.id })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, session.user.id),
          eq(gameMembers.role, "manager")
        )
      )
      .limit(1);

    if (!membership)
      return { success: false, error: "Only league managers can set member names" };

    // Verify target is a player in this game (not a manager)
    const [targetMembership] = await db
      .select({ id: gameMembers.id, role: gameMembers.role })
      .from(gameMembers)
      .where(
        and(
          eq(gameMembers.gameId, gameId),
          eq(gameMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (!targetMembership)
      return { success: false, error: "This person is not a member of the game" };

    if (targetMembership.role === "manager")
      return { success: false, error: "Cannot edit a manager's display name" };

    const trimmed = displayName.trim();
    if (!trimmed) return { success: false, error: "Display name cannot be empty" };

    await db
      .update(users)
      .set({ displayName: trimmed })
      .where(eq(users.id, targetUserId));

    revalidatePath(`/games/${gameId}/members`);
    revalidatePath(`/games/${gameId}/leaderboard`);
    return { success: true };
  } catch (err) {
    console.error("[SetMemberDisplayName] Unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    };
  }
}

// Manager action: force-sync earnings for all completed tournaments.
// Resets the sync window so the cron picks up tournaments where API earnings were delayed.
export async function syncEarnings(gameId: number) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Not authenticated" };

  const [membership] = await db
    .select({ role: gameMembers.role })
    .from(gameMembers)
    .where(and(eq(gameMembers.gameId, gameId), eq(gameMembers.userId, session.user.id)))
    .limit(1);

  if (!membership || membership.role !== "manager") {
    return { success: false, error: "Not authorized" };
  }

  try {
    // Bring all completed tournaments back into the 7-day sync window
    await db.execute(sql`UPDATE tournaments SET updated_at = NOW() WHERE is_over = true`);

    const { syncResults } = await import("@/lib/espn/sync-results");
    const results = await syncResults();

    const synced = results.filter((r: { error?: string }) => !r.error);
    const failed = results.filter((r: { error?: string }) => r.error);

    revalidatePath(`/games/${gameId}/leaderboard`);

    return {
      success: true,
      message: synced.length > 0
        ? `Synced ${synced.length} tournament(s). Leaderboard updated.`
        : "No tournaments needed syncing.",
      ...(failed.length > 0 ? { warnings: failed.map((r: { tournament: string }) => r.tournament) } : {}),
    };
  } catch (err) {
    console.error("[SyncEarnings]", err);
    return { success: false, error: err instanceof Error ? err.message : "Sync failed" };
  }
}
