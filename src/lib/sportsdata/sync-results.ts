import { db } from "@/db";
import { tournaments, golfers, tournamentResults, picks } from "@/db/schema";
import { eq, and, or, sql, inArray, gte } from "drizzle-orm";
import { fetchLeaderboard } from "./client";

export async function syncResults() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Find tournaments that need syncing:
  // - In-progress tournaments
  // - Not-yet-over tournaments that have started
  // - Recently completed tournaments (within 24h) to capture final earnings
  //   (handles race condition where sync-schedule marks isOver before we sync final results)
  const activeTournaments = await db
    .select()
    .from(tournaments)
    .where(
      and(
        eq(tournaments.canceled, false),
        or(
          eq(tournaments.isInProgress, true),
          eq(tournaments.isOver, false),
          // Catch tournaments that were recently marked as over (final earnings sync)
          and(eq(tournaments.isOver, true), gte(tournaments.updatedAt, oneDayAgo))
        )
      )
    );

  // Filter to tournaments that should have started (startDate <= now)
  const tournamentsToSync = activeTournaments.filter(
    (t) => new Date(t.startDate) <= now
  );

  const results = [];

  for (const tournament of tournamentsToSync) {
    try {
      const leaderboard = await fetchLeaderboard(
        tournament.externalTournamentId
      );

      // Update tournament status and purse (leaderboard API may have more accurate purse than Tournaments endpoint)
      const updateFields: Record<string, unknown> = {
        isOver: leaderboard.Tournament.IsOver,
        isInProgress: leaderboard.Tournament.IsInProgress,
        updatedAt: new Date(),
      };
      if (leaderboard.Tournament.Purse && leaderboard.Tournament.Purse > 0) {
        updateFields.purse = leaderboard.Tournament.Purse.toString();
      }
      await db
        .update(tournaments)
        .set(updateFields)
        .where(eq(tournaments.id, tournament.id));

      const players = leaderboard.Players || [];
      const isOver = leaderboard.Tournament.IsOver;
      let resultsCount = 0;

      if (players.length > 0) {
        // Batch-fetch all golfers for this leaderboard in one query
        const playerIds = players.map((p) => p.PlayerID);
        const golferRows = await db
          .select({ id: golfers.id, externalPlayerId: golfers.externalPlayerId })
          .from(golfers)
          .where(inArray(golfers.externalPlayerId, playerIds));

        const golferMap = new Map(golferRows.map((g) => [g.externalPlayerId, g.id]));

        // Insert any golfers not yet in the DB (handles tournaments starting before sync-field runs)
        const missingPlayers = players.filter((p) => !golferMap.has(p.PlayerID));
        if (missingPlayers.length > 0) {
          for (const p of missingPlayers) {
            try {
              const [inserted] = await db
                .insert(golfers)
                .values({
                  externalPlayerId: p.PlayerID,
                  firstName: p.FirstName,
                  lastName: p.LastName,
                  country: p.Country ?? null,
                  photoUrl: null,
                })
                .onConflictDoNothing({ target: golfers.externalPlayerId })
                .returning({ id: golfers.id });
              if (inserted) {
                golferMap.set(p.PlayerID, inserted.id);
              } else {
                // Already exists — re-fetch its id
                const [existing] = await db
                  .select({ id: golfers.id })
                  .from(golfers)
                  .where(eq(golfers.externalPlayerId, p.PlayerID))
                  .limit(1);
                if (existing) golferMap.set(p.PlayerID, existing.id);
              }
            } catch (golferErr) {
              console.error(`Failed to insert golfer ${p.PlayerID}:`, golferErr);
            }
          }
        }

        // Build result values for all matched players
        const matchedPlayers = players.filter((p) => golferMap.has(p.PlayerID));

        if (matchedPlayers.length > 0) {
          // Upsert in batches — Neon HTTP driver does not support transactions
          const BATCH_SIZE = 200;
          for (let i = 0; i < matchedPlayers.length; i += BATCH_SIZE) {
            const batch = matchedPlayers.slice(i, i + BATCH_SIZE);
            await db
              .insert(tournamentResults)
              .values(
                batch.map((p) => ({
                  tournamentId: tournament.id,
                  golferId: golferMap.get(p.PlayerID)!,
                  position: p.Rank != null ? Math.round(p.Rank) : null,
                  earnings: p.Earnings?.toString() || "0",
                  totalScore: p.TotalStrokes != null ? Math.round(p.TotalStrokes) : null,
                  totalScoreToPar: p.TotalScore != null ? Math.round(p.TotalScore) : null,
                  // During in-progress tournaments the API returns a projection
                  // probability (e.g. 0.2) for MadeCut — not an actual cut result.
                  // Only interpret it once the tournament is over.
                  madeCut: isOver
                    ? (p.MadeCut != null ? p.MadeCut >= 0.5 : false)
                    : null,
                  isWithdrawn: p.IsWithdrawn ?? false,
                  rounds: p.Rounds?.length || 0,
                }))
              )
              .onConflictDoUpdate({
                target: [tournamentResults.tournamentId, tournamentResults.golferId],
                set: {
                  position: sql`EXCLUDED.position`,
                  earnings: sql`EXCLUDED.earnings`,
                  totalScore: sql`EXCLUDED.total_score`,
                  totalScoreToPar: sql`EXCLUDED.total_score_to_par`,
                  madeCut: sql`EXCLUDED.made_cut`,
                  isWithdrawn: sql`EXCLUDED.is_withdrawn`,
                  rounds: sql`EXCLUDED.rounds`,
                  updatedAt: new Date(),
                },
              });
          }

          resultsCount = matchedPlayers.length;
        }
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
      results.push({
        tournament: tournament.name,
        error: String(error),
        resultsCount: 0,
      });
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
    // Use activeGolferId if resolve-picks has run, otherwise fall back to primary
    const activeGolferId = pick.activeGolferId ?? pick.primaryGolferId;

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
