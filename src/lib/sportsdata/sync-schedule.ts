import { db } from "@/db";
import { seasons, tournaments, golfers } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  fetchTournamentsBySeason,
  fetchPlayers,
  fetchCurrentSeason,
} from "./client";

export async function syncSchedule() {
  // Get current season from SportsData
  const currentSeason = await fetchCurrentSeason();

  // Upsert season
  const [season] = await db
    .insert(seasons)
    .values({
      year: currentSeason.Season,
      name: currentSeason.Description || `${currentSeason.Season} PGA Tour`,
      startDate: currentSeason.StartDate
        ? new Date(currentSeason.StartDate)
        : null,
      endDate: currentSeason.EndDate ? new Date(currentSeason.EndDate) : null,
      externalSeasonId: currentSeason.Season,
    })
    .onConflictDoUpdate({
      target: seasons.year,
      set: {
        name: currentSeason.Description || `${currentSeason.Season} PGA Tour`,
        startDate: currentSeason.StartDate
          ? new Date(currentSeason.StartDate)
          : null,
        endDate: currentSeason.EndDate
          ? new Date(currentSeason.EndDate)
          : null,
        updatedAt: new Date(),
      },
    })
    .returning();

  // Fetch tournaments for the season
  const apiTournaments = await fetchTournamentsBySeason(currentSeason.Season);

  for (const t of apiTournaments) {
    await db
      .insert(tournaments)
      .values({
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
        firstTeeTime: t.StartDateTime
          ? new Date(t.StartDateTime)
          : null,
        isOver: t.IsOver,
        isInProgress: t.IsInProgress,
        canceled: t.Canceled,
      })
      .onConflictDoUpdate({
        target: tournaments.externalTournamentId,
        set: {
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
          updatedAt: new Date(),
        },
      });
  }

  // Sync players
  const apiPlayers = await fetchPlayers();

  for (const p of apiPlayers) {
    await db
      .insert(golfers)
      .values({
        externalPlayerId: p.PlayerID,
        firstName: p.FirstName,
        lastName: p.LastName,
        country: p.Country,
        photoUrl: p.PhotoUrl,
      })
      .onConflictDoUpdate({
        target: golfers.externalPlayerId,
        set: {
          firstName: p.FirstName,
          lastName: p.LastName,
          country: p.Country,
          photoUrl: p.PhotoUrl,
          updatedAt: new Date(),
        },
      });
  }

  return {
    season: season.id,
    tournamentsCount: apiTournaments.length,
    playersCount: apiPlayers.length,
  };
}
