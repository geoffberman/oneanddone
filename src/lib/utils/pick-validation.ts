import { db } from "@/db";
import { tournaments, tournamentFields, usedGolfers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getTournamentLockTime } from "@/lib/utils";

export interface PickValidationResult {
  valid: boolean;
  error?: string;
}

export async function validatePick(params: {
  gameId: number;
  userId: string;
  tournamentId: number;
  primaryGolferId: number;
  alternateGolferId: number | null;
}): Promise<PickValidationResult> {
  const { gameId, userId, tournamentId, primaryGolferId, alternateGolferId } =
    params;

  // 1. Check tournament exists and pick is not locked
  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!tournament) {
    return { valid: false, error: "Tournament not found" };
  }

  if (tournament.canceled) {
    return { valid: false, error: "Tournament is canceled" };
  }

  if (tournament.isOver) {
    return { valid: false, error: "Tournament is already over" };
  }

  const now = new Date();
  const lockTime = getTournamentLockTime(tournament);
  if (now >= lockTime) {
    return { valid: false, error: "Picks are locked for this tournament" };
  }

  // 2. Check primary golfer is in the field and not withdrawn
  const [primaryInField] = await db
    .select()
    .from(tournamentFields)
    .where(
      and(
        eq(tournamentFields.tournamentId, tournamentId),
        eq(tournamentFields.golferId, primaryGolferId)
      )
    )
    .limit(1);

  if (!primaryInField) {
    return {
      valid: false,
      error: "Primary golfer is not in the tournament field",
    };
  }

  if (primaryInField.isWithdrawn) {
    return {
      valid: false,
      error: "Primary golfer has withdrawn from the tournament",
    };
  }

  // 3. Check primary golfer hasn't been used this season
  const [primaryUsed] = await db
    .select()
    .from(usedGolfers)
    .where(
      and(
        eq(usedGolfers.gameId, gameId),
        eq(usedGolfers.userId, userId),
        eq(usedGolfers.golferId, primaryGolferId)
      )
    )
    .limit(1);

  if (primaryUsed) {
    return {
      valid: false,
      error: "You have already used this golfer this season",
    };
  }

  // 4. Validate alternate if provided
  if (alternateGolferId) {
    if (alternateGolferId === primaryGolferId) {
      return {
        valid: false,
        error: "Alternate must be different from primary pick",
      };
    }

    const [alternateInField] = await db
      .select()
      .from(tournamentFields)
      .where(
        and(
          eq(tournamentFields.tournamentId, tournamentId),
          eq(tournamentFields.golferId, alternateGolferId)
        )
      )
      .limit(1);

    if (!alternateInField) {
      return {
        valid: false,
        error: "Alternate golfer is not in the tournament field",
      };
    }

    if (alternateInField.isWithdrawn) {
      return {
        valid: false,
        error: "Alternate golfer has withdrawn from the tournament",
      };
    }

    const [alternateUsed] = await db
      .select()
      .from(usedGolfers)
      .where(
        and(
          eq(usedGolfers.gameId, gameId),
          eq(usedGolfers.userId, userId),
          eq(usedGolfers.golferId, alternateGolferId)
        )
      )
      .limit(1);

    if (alternateUsed) {
      return {
        valid: false,
        error: "You have already used the alternate golfer this season",
      };
    }
  }

  return { valid: true };
}
