"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { games, gameMembers, seasons } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { generateInviteCode } from "@/lib/utils/invite-code";
import { revalidatePath } from "next/cache";

export async function createGame(name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  // Get the latest season
  const [season] = await db
    .select()
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
    .returning();

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
    .select()
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
    .select()
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
