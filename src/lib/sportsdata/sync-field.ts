import { db } from "@/db";
import { tournaments, golfers, tournamentFields } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { fetchLeaderboard } from "./client";

export async function syncField() {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Find upcoming tournaments within the next 7 days
  const upcomingTournaments = await db
    .select()
    .from(tournaments)
    .where(
      and(
        gte(tournaments.startDate, now),
        lte(tournaments.startDate, nextWeek),
        eq(tournaments.isOver, false),
        eq(tournaments.canceled, false)
      )
    );

  // Also include in-progress tournaments for withdrawal updates
  const inProgressTournaments = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.isInProgress, true));

  const allTournaments = [
    ...upcomingTournaments,
    ...inProgressTournaments.filter(
      (t) => !upcomingTournaments.some((u) => u.id === t.id)
    ),
  ];

  const results = [];

  for (const tournament of allTournaments) {
    try {
      const leaderboard = await fetchLeaderboard(
        tournament.externalTournamentId
      );

      // Update firstTeeTime from the leaderboard data
      let earliestTeeTime: Date | null = null;
      for (const player of leaderboard.Players || []) {
        const r1 = player.Rounds?.find((r) => r.Number === 1);
        if (r1?.TeeTime) {
          const teeTime = new Date(r1.TeeTime);
          if (!earliestTeeTime || teeTime < earliestTeeTime) {
            earliestTeeTime = teeTime;
          }
        }
      }

      if (earliestTeeTime) {
        await db
          .update(tournaments)
          .set({ firstTeeTime: earliestTeeTime, updatedAt: new Date() })
          .where(eq(tournaments.id, tournament.id));
      }

      // Upsert field entries
      let fieldCount = 0;
      for (const player of leaderboard.Players || []) {
        // Find the golfer in our DB
        let [golfer] = await db
          .select()
          .from(golfers)
          .where(eq(golfers.externalPlayerId, player.PlayerID))
          .limit(1);

        if (!golfer) {
          // Insert golfer if not already in our DB
          const [newGolfer] = await db
            .insert(golfers)
            .values({
              externalPlayerId: player.PlayerID,
              firstName: player.FirstName,
              lastName: player.LastName,
              country: player.Country,
            })
            .returning();
          golfer = newGolfer;
        }

        await upsertFieldEntry(
          tournament.id,
          golfer.id,
          player.IsWithdrawn,
          tournament.isInProgress
        );
        fieldCount++;
      }

      results.push({
        tournament: tournament.name,
        fieldCount,
        earliestTeeTime,
      });
    } catch (error) {
      console.error(
        `Failed to sync field for ${tournament.name}:`,
        error
      );
    }
  }

  return results;
}

async function upsertFieldEntry(
  tournamentId: number,
  golferId: number,
  isWithdrawn: boolean,
  tournamentInProgress: boolean
) {
  const [existing] = await db
    .select()
    .from(tournamentFields)
    .where(
      and(
        eq(tournamentFields.tournamentId, tournamentId),
        eq(tournamentFields.golferId, golferId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(tournamentFields)
      .set({
        isWithdrawn,
        withdrawnBeforeRound1: isWithdrawn && !tournamentInProgress,
        updatedAt: new Date(),
      })
      .where(eq(tournamentFields.id, existing.id));
  } else {
    await db.insert(tournamentFields).values({
      tournamentId,
      golferId,
      isWithdrawn,
      withdrawnBeforeRound1: isWithdrawn && !tournamentInProgress,
    });
  }
}
