"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  subGames,
  subGameTournaments,
  gameMembers,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

async function requireManager(gameId: number) {
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

  if (!membership) throw new Error("Not authorized — manager role required");
  return session.user.id;
}

export async function createSubGame(
  gameId: number,
  name: string,
  description: string | null,
  tournamentIds: number[]
) {
  await requireManager(gameId);

  const [subGame] = await db
    .insert(subGames)
    .values({
      gameId,
      name,
      description,
      createdAt: new Date(),
    })
    .returning();

  if (tournamentIds.length > 0) {
    await db.insert(subGameTournaments).values(
      tournamentIds.map((tournamentId) => ({
        subGameId: subGame.id,
        tournamentId,
      }))
    );
  }

  revalidatePath(`/games/${gameId}/settings`);
  return subGame;
}

export async function updateSubGame(
  gameId: number,
  subGameId: number,
  name: string,
  description: string | null,
  tournamentIds: number[]
) {
  await requireManager(gameId);

  await db
    .update(subGames)
    .set({ name, description })
    .where(eq(subGames.id, subGameId));

  // Replace tournament assignments
  await db
    .delete(subGameTournaments)
    .where(eq(subGameTournaments.subGameId, subGameId));

  if (tournamentIds.length > 0) {
    await db.insert(subGameTournaments).values(
      tournamentIds.map((tournamentId) => ({
        subGameId,
        tournamentId,
      }))
    );
  }

  revalidatePath(`/games/${gameId}/settings`);
}

export async function deleteSubGame(gameId: number, subGameId: number) {
  await requireManager(gameId);

  await db.delete(subGames).where(eq(subGames.id, subGameId));

  revalidatePath(`/games/${gameId}/settings`);
}

export async function getSubGames(gameId: number) {
  return db
    .select()
    .from(subGames)
    .where(eq(subGames.gameId, gameId));
}
