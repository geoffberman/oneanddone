import { db } from "@/db";
import { games, gameMembers, users, seasons } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function getGameById(gameId: number) {
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      seasonId: games.seasonId,
      seasonYear: seasons.year,
      createdBy: games.createdBy,
      inviteCode: games.inviteCode,
      isActive: games.isActive,
      createdAt: games.createdAt,
    })
    .from(games)
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .where(eq(games.id, gameId))
    .limit(1);

  return game || null;
}

export async function getGameMembers(gameId: number) {
  return db
    .select({
      id: gameMembers.id,
      userId: gameMembers.userId,
      userName: users.name,
      userImage: users.image,
      role: gameMembers.role,
      joinedAt: gameMembers.joinedAt,
    })
    .from(gameMembers)
    .innerJoin(users, eq(gameMembers.userId, users.id))
    .where(eq(gameMembers.gameId, gameId));
}

export async function getMemberCount(gameId: number): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(gameMembers)
    .where(eq(gameMembers.gameId, gameId));

  return result?.count || 0;
}

export async function getUserRole(gameId: number, userId: string) {
  const [membership] = await db
    .select({ role: gameMembers.role })
    .from(gameMembers)
    .where(
      and(eq(gameMembers.gameId, gameId), eq(gameMembers.userId, userId))
    )
    .limit(1);

  return membership?.role || null;
}
