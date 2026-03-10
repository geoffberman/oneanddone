import { db } from "@/db";
import { tournaments, golfers, tournamentFields } from "@/db/schema";
import { eq, and, gte, lte, or, inArray, sql } from "drizzle-orm";
import {
  fetchEventLeaderboard,
  splitDisplayName,
  isWithdrawn as competitorIsWithdrawn,
} from "./client";

export async function syncField() {
  const now = new Date();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Same tournament selection criteria as the sportsdata version
  const allTournaments = await db
    .select()
    .from(tournaments)
    .where(
      and(
        eq(tournaments.canceled, false),
        or(
          and(gte(tournaments.startDate, now), lte(tournaments.startDate, nextWeek)),
          and(gte(tournaments.startDate, lastWeek), eq(tournaments.isOver, false)),
          eq(tournaments.isInProgress, true)
        )
      )
    );

  const results = [];

  for (const tournament of allTournaments) {
    try {
      const data = await fetchEventLeaderboard(tournament.externalTournamentId);

      const espnTournament =
        data.tournaments?.find(
          (t) => parseInt(t.id, 10) === tournament.externalTournamentId
        ) ?? data.tournaments?.[0];

      if (!espnTournament) {
        results.push({ tournament: tournament.name, fieldCount: 0, earliestTeeTime: null });
        continue;
      }

      const players = espnTournament.competitors ?? [];

      if (players.length === 0) {
        results.push({ tournament: tournament.name, fieldCount: 0, earliestTeeTime: null });
        continue;
      }

      // ESPN provides tee times in linescores — extract earliest Round 1 start.
      // ESPN doesn't consistently expose per-player tee times in the leaderboard
      // endpoint, so we skip firstTeeTime updates from this sync and rely on
      // the schedule data.

      // Build ESPN ID → internal golfer ID map
      const espnIds = players.map((p) => parseInt(p.id, 10)).filter((n) => !isNaN(n));

      const existingGolfers =
        espnIds.length > 0
          ? await db
              .select({ id: golfers.id, externalPlayerId: golfers.externalPlayerId })
              .from(golfers)
              .where(inArray(golfers.externalPlayerId, espnIds))
          : [];

      const existingMap = new Map(
        existingGolfers.map((g) => [g.externalPlayerId, g.id])
      );

      // Upsert any missing golfers (name-match first, then insert)
      const missingPlayers = players.filter(
        (p) => !existingMap.has(parseInt(p.id, 10))
      );

      if (missingPlayers.length > 0) {
        // Try name-based bulk lookup to avoid N+1 queries
        const namePairs = missingPlayers.map((p) => {
          const { firstName, lastName } = splitDisplayName(p.athlete.displayName);
          return { espnId: parseInt(p.id, 10), firstName, lastName, p };
        });

        // Fetch all golfers whose firstName+lastName match any of the missing players
        const lastNames = [...new Set(namePairs.map((np) => np.lastName))];
        const nameMatchRows =
          lastNames.length > 0
            ? await db
                .select({
                  id: golfers.id,
                  firstName: golfers.firstName,
                  lastName: golfers.lastName,
                })
                .from(golfers)
                .where(
                  inArray(
                    sql`LOWER(${golfers.lastName})`,
                    lastNames.map((n) => n.toLowerCase())
                  )
                )
            : [];

        const nameMatchMap = new Map(
          nameMatchRows.map((g) => [
            `${g.firstName.toLowerCase()}|${g.lastName.toLowerCase()}`,
            g.id,
          ])
        );

        for (const { espnId, firstName, lastName, p } of namePairs) {
          if (isNaN(espnId)) continue;
          const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
          const matchedId = nameMatchMap.get(nameKey);

          if (matchedId) {
            // Update existing golfer's externalPlayerId to ESPN ID
            await db
              .update(golfers)
              .set({ externalPlayerId: espnId, updatedAt: now })
              .where(eq(golfers.id, matchedId));
            existingMap.set(espnId, matchedId);
          } else {
            // Insert as new golfer
            const country =
              p.athlete.flag?.alt ?? p.athlete.flag?.countryCode ?? null;
            const photoUrl = p.athlete.headshot?.href ?? null;

            try {
              const inserted = await db.execute(sql`
                INSERT INTO golfers (external_player_id, first_name, last_name, country, photo_url, created_at, updated_at)
                VALUES (${espnId}, ${firstName}, ${lastName}, ${country}, ${photoUrl}, ${now}, ${now})
                ON CONFLICT (external_player_id) DO NOTHING
                RETURNING id, external_player_id
              `);
              for (const row of inserted.rows) {
                existingMap.set(row.external_player_id as number, row.id as number);
              }
            } catch (err) {
              console.error(`Failed to insert golfer ${p.athlete.displayName}:`, err);
            }
          }
        }
      }

      // Upsert tournament_fields entries
      const fieldPlayers = players.filter((p) =>
        existingMap.has(parseInt(p.id, 10))
      );

      if (fieldPlayers.length > 0) {
        const fieldValues = fieldPlayers.map((p) => {
          const golferId = existingMap.get(parseInt(p.id, 10))!;
          const pos = p.status?.position?.shortDisplayName;
          const wd = competitorIsWithdrawn(pos);
          const wdBeforeR1 = wd && !tournament.isInProgress;
          return sql`(${tournament.id}, ${golferId}, ${wd}, ${wdBeforeR1}, ${now}, ${now})`;
        });

        const BATCH_SIZE = 200;
        for (let i = 0; i < fieldValues.length; i += BATCH_SIZE) {
          const batch = fieldValues.slice(i, i + BATCH_SIZE);
          await db.execute(sql`
            INSERT INTO tournament_fields (tournament_id, golfer_id, is_withdrawn, withdrawn_before_round_1, created_at, updated_at)
            VALUES ${sql.join(batch, sql`, `)}
            ON CONFLICT (tournament_id, golfer_id) DO UPDATE SET
              is_withdrawn = EXCLUDED.is_withdrawn,
              withdrawn_before_round_1 = EXCLUDED.withdrawn_before_round_1,
              updated_at = EXCLUDED.updated_at
          `);
        }
      }

      results.push({
        tournament: tournament.name,
        fieldCount: fieldPlayers.length,
        earliestTeeTime: null,
      });
    } catch (error) {
      console.error(`Failed to sync field for ${tournament.name}:`, error);
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
