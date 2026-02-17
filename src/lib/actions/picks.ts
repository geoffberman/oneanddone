"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { picks, gameMembers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { validatePick } from "@/lib/utils/pick-validation";
import { revalidatePath } from "next/cache";

export async function submitPick(
  gameId: number,
  tournamentId: number,
  primaryGolferId: number,
  alternateGolferId: number | null
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  // Check user is a member of this game
  const [membership] = await db
    .select()
    .from(gameMembers)
    .where(
      and(
        eq(gameMembers.gameId, gameId),
        eq(gameMembers.userId, session.user.id)
      )
    )
    .limit(1);

  if (!membership) throw new Error("You are not a member of this game");

  // Validate the pick
  const validation = await validatePick({
    gameId,
    userId: session.user.id,
    tournamentId,
    primaryGolferId,
    alternateGolferId,
  });

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Upsert the pick
  const [existingPick] = await db
    .select()
    .from(picks)
    .where(
      and(
        eq(picks.gameId, gameId),
        eq(picks.userId, session.user.id),
        eq(picks.tournamentId, tournamentId)
      )
    )
    .limit(1);

  let pick;
  if (existingPick) {
    const [updated] = await db
      .update(picks)
      .set({
        primaryGolferId,
        alternateGolferId,
        updatedAt: new Date(),
      })
      .where(eq(picks.id, existingPick.id))
      .returning();
    pick = updated;
  } else {
    const [inserted] = await db
      .insert(picks)
      .values({
        id: sql`nextval('picks_id_seq')`,
        gameId,
        userId: session.user.id,
        tournamentId,
        primaryGolferId,
        alternateGolferId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    pick = inserted;
  }

  revalidatePath(`/games/${gameId}`);
  return pick;
}

export async function getUserPick(gameId: number, tournamentId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [pick] = await db
    .select()
    .from(picks)
    .where(
      and(
        eq(picks.gameId, gameId),
        eq(picks.userId, session.user.id),
        eq(picks.tournamentId, tournamentId)
      )
    )
    .limit(1);

  return pick || null;
}
