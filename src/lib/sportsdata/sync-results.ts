import { db } from "@/db";
import { tournaments, golfers, tournamentResults, picks } from "@/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { fetchLeaderboard } from "./client";

export async function syncResults() {
  // Find in-progress or recently started tournaments
  const activeTournaments = await db
    .select()
    .from(tournaments)
    .where(
      and(
        eq(tournaments.canceled, false),
        or(
          eq(tournaments.isInProgress, true),
          eq(tournaments.isOver, false)
        )
      )
    );

  // Filter to tournaments that should have started (startDate <= now)
  const now = new Date();
  const tournamentsToSync = activeTournaments.filter(
    (t) => new Date(t.startDate) <= now && !t.isOver
  );

  const results = [];

  for (const tournament of tournamentsToSync) {
    try {
      const leaderboard = await fetchLeaderboard(
        tournament.externalTournamentId
      );

      // Update tournament status
      await db
        .update(tournaments)
        .set({
          isOver: leaderboard.Tournament.IsOver,
          isInProgress: leaderboard.Tournament.IsInProgress,
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, tournament.id));

      // Upsert results for each player
      let resultsCount = 0;
      for (const player of leaderboard.Players || []) {
        const [golfer] = await db
          .select()
          .from(golfers)
          .where(eq(golfers.externalPlayerId, player.PlayerID))
          .limit(1);

        if (!golfer) continue;

        const [existing] = await db
          .select()
          .from(tournamentResults)
          .where(
            and(
              eq(tournamentResults.tournamentId, tournament.id),
              eq(tournamentResults.golferId, golfer.id)
            )
          )
          .limit(1);

        if (existing) {
          await db
            .update(tournamentResults)
            .set({
              position: player.Rank || null,
              earnings: player.Earnings?.toString() || "0",
              totalScore: player.TotalStrokes || null,
              totalScoreToPar: player.TotalScore || null,
              madeCut: player.MadeCut === 1,
              isWithdrawn: player.IsWithdrawn,
              rounds: player.Rounds?.length || 0,
              updatedAt: new Date(),
            })
            .where(eq(tournamentResults.id, existing.id));
        } else {
          await db.insert(tournamentResults).values({
            id: sql`nextval('tournament_results_id_seq')`,
            tournamentId: tournament.id,
            golferId: golfer.id,
            position: player.Rank || null,
            earnings: player.Earnings?.toString() || "0",
            totalScore: player.TotalStrokes || null,
            totalScoreToPar: player.TotalScore || null,
            madeCut: player.MadeCut === 1,
            isWithdrawn: player.IsWithdrawn,
            rounds: player.Rounds?.length || 0,
            createdAt: now,
            updatedAt: now,
          });
        }

        resultsCount++;
      }

      // Update cached earnings on picks for this tournament
      if (leaderboard.Tournament.IsOver || leaderboard.Tournament.IsInProgress) {
        await updatePickEarnings(tournament.id);
      }

      results.push({
        tournament: tournament.name,
        isOver: leaderboard.Tournament.IsOver,
        resultsCount,
      });
    } catch (error) {
      console.error(
        `Failed to sync results for ${tournament.name}:`,
        error
      );
    }
  }

  return results;
}

async function updatePickEarnings(tournamentId: number) {
  const tournamentPicks = await db
    .select()
    .from(picks)
    .where(eq(picks.tournamentId, tournamentId));

  for (const pick of tournamentPicks) {
    const activeGolferId = pick.activeGolferId;
    if (!activeGolferId) continue;

    const [result] = await db
      .select()
      .from(tournamentResults)
      .where(
        and(
          eq(tournamentResults.tournamentId, tournamentId),
          eq(tournamentResults.golferId, activeGolferId)
        )
      )
      .limit(1);

    const earnings = result?.earnings || "0";

    await db
      .update(picks)
      .set({ earnings, updatedAt: new Date() })
      .where(eq(picks.id, pick.id));
  }
}
