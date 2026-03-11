"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { picks, gameMembers, golfers, tournamentResults } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { validatePick } from "@/lib/utils/pick-validation";
import { revalidatePath } from "next/cache";

export async function submitPick(
  gameId: number,
  tournamentId: number,
  primaryGolferId: number,
  alternateGolferId: number | null,
  targetUserId?: string  // manager proxy: submit on behalf of this member
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const actingUserId = session.user.id;
  const pickUserId = targetUserId ?? actingUserId;

  // Check acting user is a member of this game
  const [actingMembership] = await db
    .select({ id: gameMembers.id, role: gameMembers.role })
    .from(gameMembers)
    .where(and(eq(gameMembers.gameId, gameId), eq(gameMembers.userId, actingUserId)))
    .limit(1);

  if (!actingMembership) throw new Error("You are not a member of this game");

  // If picking for someone else, must be a manager
  if (pickUserId !== actingUserId) {
    if (actingMembership.role !== "manager") {
      throw new Error("Only managers can submit picks for other members");
    }
    const [targetMembership] = await db
      .select({ id: gameMembers.id })
      .from(gameMembers)
      .where(and(eq(gameMembers.gameId, gameId), eq(gameMembers.userId, pickUserId)))
      .limit(1);
    if (!targetMembership) throw new Error("That user is not a member of this game");
  }

  // Validate the pick against the target user's history
  const validation = await validatePick({
    gameId,
    userId: pickUserId,
    tournamentId,
    primaryGolferId,
    alternateGolferId,
  });

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Upsert the pick
  const [existingPick] = await db
    .select({ id: picks.id })
    .from(picks)
    .where(and(eq(picks.gameId, gameId), eq(picks.userId, pickUserId), eq(picks.tournamentId, tournamentId)))
    .limit(1);

  let pick;
  if (existingPick) {
    const [updated] = await db
      .update(picks)
      .set({ primaryGolferId, alternateGolferId, updatedAt: new Date() })
      .where(eq(picks.id, existingPick.id))
      .returning();
    pick = updated;
  } else {
    const [inserted] = await db
      .insert(picks)
      .values({
        gameId,
        userId: pickUserId,
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

export async function getUserPick(gameId: number, tournamentId: number, forUserId?: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = forUserId ?? session.user.id;

  const [pick] = await db
    .select({
      id: picks.id,
      gameId: picks.gameId,
      userId: picks.userId,
      tournamentId: picks.tournamentId,
      primaryGolferId: picks.primaryGolferId,
      alternateGolferId: picks.alternateGolferId,
      activeGolferId: picks.activeGolferId,
      alternateActivated: picks.alternateActivated,
    })
    .from(picks)
    .where(
      and(
        eq(picks.gameId, gameId),
        eq(picks.userId, userId),
        eq(picks.tournamentId, tournamentId)
      )
    )
    .limit(1);

  return pick || null;
}

async function getGolferName(golferId: number): Promise<string> {
  const [g] = await db
    .select({ firstName: golfers.firstName, lastName: golfers.lastName })
    .from(golfers)
    .where(eq(golfers.id, golferId))
    .limit(1);
  return g ? `${g.firstName} ${g.lastName}` : "Unknown";
}

async function getGolferNames(
  golferIds: number[]
): Promise<Record<number, string>> {
  if (golferIds.length === 0) return {};
  const rows = await db
    .select({
      id: golfers.id,
      firstName: golfers.firstName,
      lastName: golfers.lastName,
    })
    .from(golfers)
    .where(inArray(golfers.id, golferIds));

  const map: Record<number, string> = {};
  for (const r of rows) {
    map[r.id] = `${r.firstName} ${r.lastName}`;
  }
  return map;
}

export async function getUserPickWithNames(
  gameId: number,
  tournamentId: number
) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const pick = await getUserPick(gameId, tournamentId);
  if (!pick) return null;

  const effectiveGolferId = pick.activeGolferId ?? pick.primaryGolferId;

  const [primaryName, alternateName, activeName] = await Promise.all([
    getGolferName(pick.primaryGolferId),
    pick.alternateGolferId ? getGolferName(pick.alternateGolferId) : Promise.resolve(null),
    pick.activeGolferId && pick.activeGolferId !== pick.primaryGolferId
      ? getGolferName(pick.activeGolferId)
      : Promise.resolve(null),
  ]);

  // Fetch live score for the effective golfer
  const [liveResult] = await db
    .select({
      position: tournamentResults.position,
      totalScoreToPar: tournamentResults.totalScoreToPar,
      madeCut: tournamentResults.madeCut,
      isWithdrawn: tournamentResults.isWithdrawn,
      rounds: tournamentResults.rounds,
    })
    .from(tournamentResults)
    .where(
      and(
        eq(tournamentResults.tournamentId, tournamentId),
        eq(tournamentResults.golferId, effectiveGolferId)
      )
    )
    .limit(1);

  return {
    primaryName,
    alternateName,
    activeName,
    primaryGolferId: pick.primaryGolferId,
    alternateGolferId: pick.alternateGolferId,
    activeGolferId: pick.activeGolferId,
    alternateActivated: pick.alternateActivated,
    livePosition: liveResult?.position ?? null,
    liveTotalScoreToPar: liveResult?.totalScoreToPar ?? null,
    liveMadeCut: liveResult?.madeCut ?? null,
    liveIsWithdrawn: liveResult?.isWithdrawn ?? null,
    liveRounds: liveResult?.rounds ?? null,
  };
}

export async function getUserPicksForTournament(
  tournamentId: number,
  gameIds: number[]
): Promise<
  Record<number, { primaryName: string; alternateName: string | null }>
> {
  const session = await auth();
  if (!session?.user?.id || gameIds.length === 0) return {};

  const userPicks = await db
    .select({
      gameId: picks.gameId,
      primaryGolferId: picks.primaryGolferId,
      alternateGolferId: picks.alternateGolferId,
    })
    .from(picks)
    .where(
      and(
        eq(picks.userId, session.user.id),
        eq(picks.tournamentId, tournamentId),
        inArray(picks.gameId, gameIds)
      )
    );

  if (userPicks.length === 0) return {};

  // Gather all golfer IDs and fetch names in one query
  const golferIds = new Set<number>();
  for (const p of userPicks) {
    golferIds.add(p.primaryGolferId);
    if (p.alternateGolferId) golferIds.add(p.alternateGolferId);
  }
  const names = await getGolferNames([...golferIds]);

  const result: Record<
    number,
    { primaryName: string; alternateName: string | null }
  > = {};
  for (const p of userPicks) {
    result[p.gameId] = {
      primaryName: names[p.primaryGolferId] || "Unknown",
      alternateName: p.alternateGolferId
        ? names[p.alternateGolferId] || "Unknown"
        : null,
    };
  }
  return result;
}
