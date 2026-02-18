"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { games, gameMembers, seasons, users, passwordResetTokens } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { generateInviteCode } from "@/lib/utils/invite-code";
import { sendMemberAddedEmail, sendInviteEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

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
      id: sql`nextval('games_id_seq')`,
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
    id: sql`nextval('game_members_id_seq')`,
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
    id: sql`nextval('game_members_id_seq')`,
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
      id: sql`nextval('game_members_id_seq')`,
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

  revalidatePath("/");
}
