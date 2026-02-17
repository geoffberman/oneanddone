import { db } from "@/db";
import { tournaments, golfers } from "@/db/schema";
import { eq, and, gte, lte, or, inArray, sql } from "drizzle-orm";
import { fetchLeaderboard } from "./client";

export async function syncField() {
  const now = new Date();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Find tournaments that are upcoming (next 7 days), recently started (last 7 days & not over),
  // or marked as in-progress
  const allTournaments = await db
    .select()
    .from(tournaments)
    .where(
      and(
        eq(tournaments.canceled, false),
        or(
          // Upcoming within next week
          and(gte(tournaments.startDate, now), lte(tournaments.startDate, nextWeek)),
          // Recently started and not over
          and(gte(tournaments.startDate, lastWeek), eq(tournaments.isOver, false)),
          // Explicitly in progress
          eq(tournaments.isInProgress, true)
        )
      )
    );

  const results = [];

  for (const tournament of allTournaments) {
    try {
      const leaderboard = await fetchLeaderboard(
        tournament.externalTournamentId
      );

      const players = leaderboard.Players || [];
      if (players.length === 0) {
        results.push({ tournament: tournament.name, fieldCount: 0, earliestTeeTime: null });
        continue;
      }

      // Update firstTeeTime from the leaderboard data
      let earliestTeeTime: Date | null = null;
      for (const player of players) {
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
          .set({ firstTeeTime: earliestTeeTime, updatedAt: now })
          .where(eq(tournaments.id, tournament.id));
      }

      // Bulk upsert any golfers not yet in our DB
      const playerIds = players.map((p) => p.PlayerID);
      const existingGolfers = playerIds.length > 0
        ? await db
            .select({ id: golfers.id, externalPlayerId: golfers.externalPlayerId })
            .from(golfers)
            .where(inArray(golfers.externalPlayerId, playerIds))
        : [];

      const existingMap = new Map(existingGolfers.map((g) => [g.externalPlayerId, g.id]));

      // Insert missing golfers in bulk
      const missingPlayers = players.filter((p) => !existingMap.has(p.PlayerID));
      if (missingPlayers.length > 0) {
        const golferValues = missingPlayers.map((p) =>
          sql`(${p.PlayerID}, ${p.FirstName}, ${p.LastName}, ${p.Country}, ${null}, ${now}, ${now})`
        );
        const inserted = await db.execute(sql`
          INSERT INTO golfers (external_player_id, first_name, last_name, country, photo_url, created_at, updated_at)
          VALUES ${sql.join(golferValues, sql`, `)}
          ON CONFLICT (external_player_id) DO NOTHING
          RETURNING id, external_player_id
        `);
        for (const row of inserted.rows) {
          existingMap.set(row.external_player_id as number, row.id as number);
        }
      }

      // Bulk upsert tournament field entries
      const fieldValues = players
        .filter((p) => existingMap.has(p.PlayerID))
        .map((p) => {
          const golferId = existingMap.get(p.PlayerID)!;
          const wdBeforeR1 = p.IsWithdrawn && !tournament.isInProgress;
          return sql`(${tournament.id}, ${golferId}, ${p.IsWithdrawn}, ${wdBeforeR1}, ${now}, ${now})`;
        });

      if (fieldValues.length > 0) {
        await db.execute(sql`
          INSERT INTO tournament_fields (tournament_id, golfer_id, is_withdrawn, withdrawn_before_round_1, created_at, updated_at)
          VALUES ${sql.join(fieldValues, sql`, `)}
          ON CONFLICT (tournament_id, golfer_id) DO UPDATE SET
            is_withdrawn = EXCLUDED.is_withdrawn,
            withdrawn_before_round_1 = EXCLUDED.withdrawn_before_round_1,
            updated_at = EXCLUDED.updated_at
        `);
      }

      results.push({
        tournament: tournament.name,
        fieldCount: fieldValues.length,
        earliestTeeTime,
      });
    } catch (error) {
      console.error(
        `Failed to sync field for ${tournament.name}:`,
        error
      );
      results.push({
        tournament: tournament.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    tournamentsFound: allTournaments.length,
    tournamentNames: allTournaments.map((t) => t.name),
    details: results,
  };
}
