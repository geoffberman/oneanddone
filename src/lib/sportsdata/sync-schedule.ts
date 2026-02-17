import { db } from "@/db";
import { seasons, tournaments, golfers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  fetchTournamentsBySeason,
  fetchPlayers,
  fetchCurrentSeason,
} from "./client";

export async function syncSchedule() {
  const currentSeason = await fetchCurrentSeason();
  const now = new Date();

  // Upsert season
  const [existingSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.year, currentSeason.SeasonID))
    .limit(1);

  let season;

  if (existingSeason) {
    const [updated] = await db
      .update(seasons)
      .set({
        name: currentSeason.Description || `${currentSeason.SeasonID} PGA Tour`,
        startDate: currentSeason.StartDate
          ? new Date(currentSeason.StartDate)
          : null,
        endDate: currentSeason.EndDate
          ? new Date(currentSeason.EndDate)
          : null,
        updatedAt: now,
      })
      .where(eq(seasons.year, currentSeason.SeasonID))
      .returning();
    season = updated;
  } else {
    const seasonName =
      currentSeason.Description || `${currentSeason.SeasonID} PGA Tour`;
    const startDate = currentSeason.StartDate
      ? new Date(currentSeason.StartDate)
      : null;
    const endDate = currentSeason.EndDate
      ? new Date(currentSeason.EndDate)
      : null;

    const rows = await db.execute(sql`
      INSERT INTO seasons (year, name, start_date, end_date, external_season_id, created_at, updated_at)
      VALUES (${currentSeason.SeasonID}, ${seasonName}, ${startDate}, ${endDate}, ${currentSeason.SeasonID}, ${now}, ${now})
      RETURNING id, year, name, start_date, end_date, external_season_id, created_at, updated_at
    `);
    season = {
      id: rows.rows[0].id as number,
      year: rows.rows[0].year as number,
      name: rows.rows[0].name as string,
    };
  }

  // Fetch tournaments for the season
  const apiTournaments = await fetchTournamentsBySeason(currentSeason.SeasonID);

  for (const t of apiTournaments) {
    const [existing] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.externalTournamentId, t.TournamentID))
      .limit(1);

    if (existing) {
      await db
        .update(tournaments)
        .set({
          name: t.Name,
          startDate: new Date(t.StartDate),
          endDate: t.EndDate ? new Date(t.EndDate) : null,
          location: t.Location,
          venue: t.Venue,
          par: t.Par,
          purse: t.Purse?.toString(),
          timeZone: t.TimeZone,
          isOver: t.IsOver,
          isInProgress: t.IsInProgress,
          canceled: t.Canceled,
          updatedAt: now,
        })
        .where(eq(tournaments.externalTournamentId, t.TournamentID));
    } else {
      const startDate = new Date(t.StartDate);
      const endDate = t.EndDate ? new Date(t.EndDate) : null;
      const firstTeeTime = t.StartDateTime
        ? new Date(t.StartDateTime)
        : null;
      const purse = t.Purse?.toString() || null;

      await db.execute(sql`
        INSERT INTO tournaments (external_tournament_id, season_id, name, start_date, end_date, location, venue, par, purse, time_zone, first_tee_time, is_over, is_in_progress, canceled, created_at, updated_at)
        VALUES (${t.TournamentID}, ${season.id}, ${t.Name}, ${startDate}, ${endDate}, ${t.Location}, ${t.Venue}, ${t.Par}, ${purse}, ${t.TimeZone}, ${firstTeeTime}, ${t.IsOver}, ${t.IsInProgress}, ${t.Canceled}, ${now}, ${now})
      `);
    }
  }

  // Sync players
  const apiPlayers = await fetchPlayers();

  for (const p of apiPlayers) {
    const [existing] = await db
      .select()
      .from(golfers)
      .where(eq(golfers.externalPlayerId, p.PlayerID))
      .limit(1);

    if (existing) {
      await db
        .update(golfers)
        .set({
          firstName: p.FirstName,
          lastName: p.LastName,
          country: p.Country,
          photoUrl: p.PhotoUrl,
          updatedAt: now,
        })
        .where(eq(golfers.externalPlayerId, p.PlayerID));
    } else {
      await db.execute(sql`
        INSERT INTO golfers (external_player_id, first_name, last_name, country, photo_url, created_at, updated_at)
        VALUES (${p.PlayerID}, ${p.FirstName}, ${p.LastName}, ${p.Country}, ${p.PhotoUrl}, ${now}, ${now})
      `);
    }
  }

  return {
    season: season.id,
    tournamentsCount: apiTournaments.length,
    playersCount: apiPlayers.length,
  };
}
