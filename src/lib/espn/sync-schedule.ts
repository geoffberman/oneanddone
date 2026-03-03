import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  fetchLeaderboard,
  getCurrentSeasonYear,
  parsePurse,
  getTournamentLocation,
} from "./client";

export async function syncSchedule() {
  const year = getCurrentSeasonYear();
  const now = new Date();

  const data = await fetchLeaderboard(year);

  const seasonYear = data.season?.year ?? year;
  const seasonName = data.season?.displayName ?? `${seasonYear} PGA Tour`;

  // Upsert season
  const seasonResult = await db.execute(sql`
    INSERT INTO seasons (year, name, created_at, updated_at)
    VALUES (${seasonYear}, ${seasonName}, ${now}, ${now})
    ON CONFLICT (year) DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = EXCLUDED.updated_at
    RETURNING id
  `);
  const seasonId = seasonResult.rows[0].id as number;

  const tournaments = data.tournaments ?? [];

  if (tournaments.length > 0) {
    // Process in batches to avoid hitting parameter limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < tournaments.length; i += BATCH_SIZE) {
      const batch = tournaments.slice(i, i + BATCH_SIZE);

      const values = batch.map((t) => {
        const espnId = parseInt(t.id, 10);
        const startDate = new Date(t.date.start);
        const endDate = t.date.end ? new Date(t.date.end) : null;
        const purse = parsePurse(t.purse);
        const location = getTournamentLocation(t);
        const venue = t.venue?.fullName ?? null;
        const courseName =
          t.courses && t.courses.length > 0 ? t.courses[0].name ?? null : null;
        const par =
          t.courses && t.courses.length > 0 ? t.courses[0].par ?? null : null;
        const isOver = t.status.type.completed && t.status.type.state === "post";
        const isInProgress = t.status.type.state === "in";
        const canceled = false; // ESPN doesn't explicitly flag canceled; treat absent data as not canceled

        return sql`(
          ${espnId},
          ${seasonId},
          ${t.name},
          ${startDate},
          ${endDate},
          ${location},
          ${venue},
          ${courseName},
          ${par},
          ${purse},
          ${null}::timestamptz,
          ${isOver},
          ${isInProgress},
          ${canceled},
          ${now},
          ${now}
        )`;
      });

      await db.execute(sql`
        INSERT INTO tournaments (
          external_tournament_id, season_id, name,
          start_date, end_date, location, venue, course_name,
          par, purse, first_tee_time,
          is_over, is_in_progress, canceled,
          created_at, updated_at
        )
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (external_tournament_id) DO UPDATE SET
          name            = EXCLUDED.name,
          start_date      = EXCLUDED.start_date,
          end_date        = EXCLUDED.end_date,
          location        = EXCLUDED.location,
          venue           = EXCLUDED.venue,
          course_name     = EXCLUDED.course_name,
          par             = EXCLUDED.par,
          purse           = COALESCE(NULLIF(EXCLUDED.purse, '0'), tournaments.purse),
          is_over         = EXCLUDED.is_over,
          is_in_progress  = EXCLUDED.is_in_progress,
          canceled        = EXCLUDED.canceled,
          updated_at      = EXCLUDED.updated_at
      `);
    }
  }

  return {
    season: seasonId,
    seasonYear,
    tournamentsCount: tournaments.length,
  };
}
