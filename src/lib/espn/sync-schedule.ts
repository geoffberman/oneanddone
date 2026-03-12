import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import {
  fetchCoreApiSchedule,
  getCurrentSeasonYear,
  parsePurse,
  getTournamentLocation,
} from "./client";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+(presented?|powered|sponsored|pres\.?)\s+by\s+.*/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function syncSchedule() {
  const year = getCurrentSeasonYear();
  const now = new Date();

  const espnTournaments = await fetchCoreApiSchedule(year);

  const seasonYear = year;
  const seasonName = `${seasonYear} PGA Tour`;

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


  // ── Step 1: Migrate SportsData tournament rows → ESPN IDs ─────────────────
  // Must run BEFORE the upsert so old SportsData rows (id < 100000) get the
  // ESPN ID first. Otherwise the upsert in Step 2 inserts a duplicate row and
  // the subsequent UPDATE here hits a unique-constraint violation.
  //
  // Uses fuzzy name matching (strips sponsor suffixes, leading "The", etc.)
  // so that e.g. "Memorial Tournament" matches "Memorial Tournament presented by Workday".
  const oldRows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      externalTournamentId: tournaments.externalTournamentId,
    })
    .from(tournaments)
    .where(
      and(
        eq(tournaments.seasonId, seasonId),
        lt(tournaments.externalTournamentId, 100000)
      )
    );

  let migratedCount = 0;
  for (const t of espnTournaments) {
    const espnId = parseInt(t.id, 10);
    if (isNaN(espnId)) continue;

    const isOver = t.status.type.completed && t.status.type.state === "post";
    const isInProgress = t.status.type.state === "in";

    const normEspn = normalizeName(t.name);
    const match = oldRows.find(
      (r) =>
        r.externalTournamentId !== espnId &&
        normalizeName(r.name) === normEspn
    );

    if (match) {
      await db.execute(sql`
        UPDATE tournaments
        SET
          external_tournament_id = ${espnId},
          is_over                = ${isOver},
          is_in_progress         = ${isInProgress},
          updated_at             = ${now}
        WHERE id = ${match.id}
      `);
      migratedCount++;
    }
  }

  // ── Step 2: Upsert via ESPN ID ─────────────────────────────────────────────
  // Inserts new rows or updates existing ESPN-ID rows.
  if (espnTournaments.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < espnTournaments.length; i += BATCH_SIZE) {
      const batch = espnTournaments.slice(i, i + BATCH_SIZE);

      const values = batch.map((t) => {
        const espnId = parseInt(t.id, 10);
        const startDate = new Date(t.date);
        const endDate = t.endDate ? new Date(t.endDate) : null;
        const purse = parsePurse(t.purse);
        const location = getTournamentLocation(t);
        const venue = t.venue?.fullName ?? null;
        const courseName =
          t.courses && t.courses.length > 0 ? t.courses[0].name ?? null : null;
        const par =
          t.courses && t.courses.length > 0 ? t.courses[0].par ?? null : null;
        const isOver = t.status.type.completed && t.status.type.state === "post";
        const isInProgress = t.status.type.state === "in";

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
          false,
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
          updated_at      = EXCLUDED.updated_at
      `);
    }
  }

  // ── Step 3: Date-based auto-close ─────────────────────────────────────────
  // Any tournament whose end_date passed more than 1 day ago but is still
  // flagged as live gets closed here. This is a safety net for API failures.
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const autoCloseResult = await db.execute(sql`
    UPDATE tournaments
    SET is_over = true, is_in_progress = false, updated_at = ${now}
    WHERE canceled = false
      AND is_over  = false
      AND end_date IS NOT NULL
      AND end_date < ${yesterday}
  `);
  const autoClosedCount = autoCloseResult.rowCount ?? 0;

  return {
    season: seasonId,
    seasonYear,
    tournamentsCount: espnTournaments.length,
    migratedToEspnIds: migratedCount,
    autoClosedStale: autoClosedCount,
  };
}
