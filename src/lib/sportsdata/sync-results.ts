import { db } from "@/db";
import { tournaments, golfers, tournamentResults, picks } from "@/db/schema";
import { eq, and, or, sql, inArray } from "drizzle-orm";
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

      const players = leaderboard.Players || [];
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
          const golferValues = missingPlayers.map((p) =>
            sql`(${p.PlayerID}, ${p.FirstName}, ${p.LastName}, ${p.Country ?? null}, ${null}, ${now}, ${now})`
          );
          const inserted = await db.execute(sql`
            INSERT INTO golfers (external_player_id, first_name, last_name, country, photo_url, created_at, updated_at)
            VALUES ${sql.join(golferValues, sql`, `)}
            ON CONFLICT (external_player_id) DO NOTHING
            RETURNING id, external_player_id
          `);
          for (const row of inserted.rows) {
            golferMap.set(row.external_player_id as number, row.id as number);
          }
        }

        // Build result values for all matched players
        const matchedPlayers = players.filter((p) => golferMap.has(p.PlayerID));

        if (matchedPlayers.length > 0) {
          const resultValues = matchedPlayers.map((p) => {
            const golferId = golferMap.get(p.PlayerID)!;
            return sql`(
              ${tournament.id},
              ${golferId},
              ${p.Rank ?? null},
              ${p.Earnings?.toString() || "0"},
              ${p.TotalStrokes ?? null},
              ${p.TotalScore ?? null},
              ${p.MadeCut === 1},
              ${p.IsWithdrawn},
              ${p.Rounds?.length || 0},
              ${now},
              ${now}
            )`;
          });

          // Bulk upsert — no manual sequence needed, no N+1 queries
          await db.execute(sql`
            INSERT INTO tournament_results
              (tournament_id, golfer_id, position, earnings, total_score, total_score_to_par, made_cut, is_withdrawn, rounds, created_at, updated_at)
            VALUES ${sql.join(resultValues, sql`, `)}
            ON CONFLICT (tournament_id, golfer_id) DO UPDATE SET
              position = EXCLUDED.position,
              earnings = EXCLUDED.earnings,
              total_score = EXCLUDED.total_score,
              total_score_to_par = EXCLUDED.total_score_to_par,
              made_cut = EXCLUDED.made_cut,
              is_withdrawn = EXCLUDED.is_withdrawn,
              rounds = EXCLUDED.rounds,
              updated_at = EXCLUDED.updated_at
          `);

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
