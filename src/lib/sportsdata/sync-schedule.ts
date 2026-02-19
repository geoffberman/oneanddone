import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  fetchTournamentsBySeason,
  fetchPlayers,
  fetchPlayerSeasonStats,
  fetchCurrentSeason,
} from "./client";
import { parseEasternDateTime } from "./tournament-match";

export async function syncSchedule() {
  const currentSeason = await fetchCurrentSeason();
  const now = new Date();
  const seasonName =
    currentSeason.Description || `${currentSeason.SeasonID} PGA Tour`;
  const startDate = currentSeason.StartDate
    ? new Date(currentSeason.StartDate)
    : null;
  const endDate = currentSeason.EndDate
    ? new Date(currentSeason.EndDate)
    : null;

  // Upsert season (single row)
  const seasonResult = await db.execute(sql`
    INSERT INTO seasons (year, name, start_date, end_date, external_season_id, created_at, updated_at)
    VALUES (${currentSeason.SeasonID}, ${seasonName}, ${startDate}, ${endDate}, ${currentSeason.SeasonID}, ${now}, ${now})
    ON CONFLICT (year) DO UPDATE SET
      name = EXCLUDED.name,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      updated_at = EXCLUDED.updated_at
    RETURNING id
  `);
  const seasonId = seasonResult.rows[0].id as number;

  // Bulk upsert tournaments (single query)
  const apiTournaments = await fetchTournamentsBySeason(currentSeason.SeasonID);

  if (apiTournaments.length > 0) {
    const tournamentValues = apiTournaments.map((t) => {
      const tStart = new Date(t.StartDate);
      const tEnd = t.EndDate ? new Date(t.EndDate) : null;
      const tFirstTee = t.StartDateTime ? parseEasternDateTime(t.StartDateTime) : null;
      const tPurse = t.Purse?.toString() || null;
      return sql`(${t.TournamentID}, ${seasonId}, ${t.Name}, ${tStart}, ${tEnd}, ${t.Location}, ${t.Venue}, ${t.Par}, ${tPurse}, ${t.TimeZone}, ${tFirstTee}, ${t.IsOver}, ${t.IsInProgress}, ${t.Canceled}, ${now}, ${now})`;
    });

    await db.execute(sql`
      INSERT INTO tournaments (external_tournament_id, season_id, name, start_date, end_date, location, venue, par, purse, time_zone, first_tee_time, is_over, is_in_progress, canceled, created_at, updated_at)
      VALUES ${sql.join(tournamentValues, sql`, `)}
      ON CONFLICT (external_tournament_id) DO UPDATE SET
        name = EXCLUDED.name,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        location = EXCLUDED.location,
        venue = EXCLUDED.venue,
        par = EXCLUDED.par,
        purse = EXCLUDED.purse,
        time_zone = EXCLUDED.time_zone,
        first_tee_time = EXCLUDED.first_tee_time,
        is_over = EXCLUDED.is_over,
        is_in_progress = EXCLUDED.is_in_progress,
        canceled = EXCLUDED.canceled,
        updated_at = EXCLUDED.updated_at
    `);
  }

  // Ensure world_ranking column exists
  await db.execute(sql`
    ALTER TABLE golfers ADD COLUMN IF NOT EXISTS world_ranking integer
  `);

  // Bulk upsert golfers (batches of 200 to stay within param limits)
  const apiPlayers = await fetchPlayers();
  const BATCH_SIZE = 200;

  for (let i = 0; i < apiPlayers.length; i += BATCH_SIZE) {
    const batch = apiPlayers.slice(i, i + BATCH_SIZE);
    const golferValues = batch.map((p) => {
      return sql`(${p.PlayerID}, ${p.FirstName}, ${p.LastName}, ${p.Country}, ${p.PhotoUrl}, ${now}, ${now})`;
    });

    await db.execute(sql`
      INSERT INTO golfers (external_player_id, first_name, last_name, country, photo_url, created_at, updated_at)
      VALUES ${sql.join(golferValues, sql`, `)}
      ON CONFLICT (external_player_id) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        country = EXCLUDED.country,
        photo_url = EXCLUDED.photo_url,
        updated_at = EXCLUDED.updated_at
    `);
  }

  // Fetch world rankings from PlayerSeasonStats endpoint (separate from Players)
  let rankingsUpdated = 0;
  let rankingsError: string | null = null;
  let rankingsDiag: Record<string, unknown> = {};
  try {
    const seasonStats = await fetchPlayerSeasonStats(currentSeason.SeasonID);
    // Inspect the actual shape of the first entry for debugging
    const sample = seasonStats.length > 0 ? seasonStats[0] : null;
    const sampleKeys = sample ? Object.keys(sample) : [];

    // Try to find the ranking field — API might use different casing
    const rawFirst = sample as Record<string, unknown> | null;
    const rankField = rawFirst
      ? sampleKeys.find((k) => k.toLowerCase().includes("worldgolfrank") && !k.toLowerCase().includes("lastweek"))
      : null;

    rankingsDiag = {
      statsCount: seasonStats.length,
      sampleKeys: sampleKeys.slice(0, 20),
      rankField: rankField || "NOT_FOUND",
      samplePlayerID: rawFirst?.PlayerID ?? rawFirst?.playerId ?? "?",
      sampleRank: rankField && rawFirst ? rawFirst[rankField] : null,
    };

    const rankMap = new Map<number, number>();
    for (const stat of seasonStats) {
      // Use the discovered field name if available, otherwise try WorldGolfRank
      const raw = stat as unknown as Record<string, unknown>;
      const rank = rankField ? (raw[rankField] as number | null) : stat.WorldGolfRank;
      const playerId = (raw.PlayerID ?? raw.playerId) as number;
      if (rank && rank > 0 && playerId) {
        rankMap.set(playerId, rank);
      }
    }

    rankingsDiag.playersWithRank = rankMap.size;

    // Batch update rankings
    const RANK_BATCH = 200;
    const entries = Array.from(rankMap.entries());
    for (let i = 0; i < entries.length; i += RANK_BATCH) {
      const batch = entries.slice(i, i + RANK_BATCH);
      const valuePairs = batch.map(
        ([playerId, rank]) => sql`(${playerId}::integer, ${rank}::integer)`
      );
      await db.execute(sql`
        UPDATE golfers SET world_ranking = v.rank, updated_at = ${now}
        FROM (VALUES ${sql.join(valuePairs, sql`, `)}) AS v(ext_id, rank)
        WHERE golfers.external_player_id = v.ext_id
      `);
      rankingsUpdated += batch.length;
    }
  } catch (err) {
    rankingsError = err instanceof Error ? err.message : String(err);
    console.error("[SyncSchedule] Failed to fetch PlayerSeasonStats for rankings:", err);
  }

  return {
    season: seasonId,
    tournamentsCount: apiTournaments.length,
    playersCount: apiPlayers.length,
    rankingsUpdated,
    rankingsDiag,
    ...(rankingsError ? { rankingsError } : {}),
  };
}
