import { db } from "@/db";
import { seasons, tournaments, golfers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  fetchTournamentsBySeason,
  fetchPlayers,
  fetchCurrentSeason,
} from "./client";

export async function syncSchedule() {
  // Get current season from SportsData
  const currentSeason = await fetchCurrentSeason();

  // Upsert season
  const [existingSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.year, currentSeason.Season))
    .limit(1);

  let season;
  const now = new Date();

  if (existingSeason) {
    const [updated] = await db
      .update(seasons)
      .set({
        name: currentSeason.Description || `${currentSeason.Season} PGA Tour`,
        startDate: currentSeason.StartDate
          ? new Date(currentSeason.StartDate)
          : null,
        endDate: currentSeason.EndDate
          ? new Date(currentSeason.EndDate)
          : null,
        updatedAt: now,
      })
      .where(eq(seasons.year, currentSeason.Season))
      .returning();
    season = updated;
  } else {
    const [inserted] = await db
      .insert(seasons)
      .values({
        id: sql`nextval('seasons_id_seq')`,
        year: currentSeason.Season,
        name: currentSeason.Description || `${currentSeason.Season} PGA Tour`,
        startDate: currentSeason.StartDate
          ? new Date(currentSeason.StartDate)
          : null,
        endDate: currentSeason.EndDate
          ? new Date(currentSeason.EndDate)
          : null,
        externalSeasonId: currentSeason.Season,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    season = inserted;
  }

  // Fetch tournaments for the season
  const apiTournaments = await fetchTournamentsBySeason(currentSeason.Season);

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
      await db.insert(tournaments).values({
        id: sql`nextval('tournaments_id_seq')`,
        externalTournamentId: t.TournamentID,
        seasonId: season.id,
        name: t.Name,
        startDate: new Date(t.StartDate),
        endDate: t.EndDate ? new Date(t.EndDate) : null,
        location: t.Location,
        venue: t.Venue,
        par: t.Par,
        purse: t.Purse?.toString(),
        timeZone: t.TimeZone,
        firstTeeTime: t.StartDateTime ? new Date(t.StartDateTime) : null,
        isOver: t.IsOver,
        isInProgress: t.IsInProgress,
        canceled: t.Canceled,
        createdAt: now,
        updatedAt: now,
      });
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
      await db.insert(golfers).values({
        id: sql`nextval('golfers_id_seq')`,
        externalPlayerId: p.PlayerID,
        firstName: p.FirstName,
        lastName: p.LastName,
        country: p.Country,
        photoUrl: p.PhotoUrl,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return {
    season: season.id,
    tournamentsCount: apiTournaments.length,
    playersCount: apiPlayers.length,
  };
}
