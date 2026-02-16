import { db } from "@/db";
import {
  tournaments,
  tournamentFields,
  picks,
  usedGolfers,
} from "@/db/schema";
import { eq, and, isNull, lte } from "drizzle-orm";

export async function resolvePicks() {
  const now = new Date();

  // Find tournaments where firstTeeTime has passed but picks haven't been resolved
  const lockedTournaments = await db
    .select()
    .from(tournaments)
    .where(
      and(
        lte(tournaments.firstTeeTime, now),
        eq(tournaments.isOver, false),
        eq(tournaments.canceled, false)
      )
    );

  const results = [];

  for (const tournament of lockedTournaments) {
    // Find picks for this tournament that haven't been resolved yet (activeGolferId is null)
    const unresolvedPicks = await db
      .select()
      .from(picks)
      .where(
        and(
          eq(picks.tournamentId, tournament.id),
          isNull(picks.activeGolferId)
        )
      );

    let resolvedCount = 0;
    let alternateCount = 0;

    for (const pick of unresolvedPicks) {
      // Check if primary golfer withdrew before round 1
      const [primaryField] = await db
        .select()
        .from(tournamentFields)
        .where(
          and(
            eq(tournamentFields.tournamentId, tournament.id),
            eq(tournamentFields.golferId, pick.primaryGolferId)
          )
        )
        .limit(1);

      let activeGolferId = pick.primaryGolferId;
      let alternateActivated = false;

      if (primaryField?.withdrawnBeforeRound1 && pick.alternateGolferId) {
        // Check if alternate is also withdrawn
        const [alternateField] = await db
          .select()
          .from(tournamentFields)
          .where(
            and(
              eq(tournamentFields.tournamentId, tournament.id),
              eq(tournamentFields.golferId, pick.alternateGolferId)
            )
          )
          .limit(1);

        if (!alternateField?.withdrawnBeforeRound1) {
          activeGolferId = pick.alternateGolferId;
          alternateActivated = true;
          alternateCount++;
        }
      }

      // Update the pick with the resolved active golfer
      await db
        .update(picks)
        .set({
          activeGolferId,
          alternateActivated,
          updatedAt: new Date(),
        })
        .where(eq(picks.id, pick.id));

      // Record the used golfer (the active one)
      await db
        .insert(usedGolfers)
        .values({
          gameId: pick.gameId,
          userId: pick.userId,
          golferId: activeGolferId,
          tournamentId: tournament.id,
        })
        .onConflictDoNothing();

      resolvedCount++;
    }

    if (resolvedCount > 0) {
      results.push({
        tournament: tournament.name,
        resolvedCount,
        alternateCount,
      });
    }
  }

  return results;
}
