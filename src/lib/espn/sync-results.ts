import { db } from "@/db";
import { tournaments, golfers, tournamentResults, picks } from "@/db/schema";
import { eq, and, or, sql, inArray, gte } from "drizzle-orm";
import {
  fetchEventLeaderboard,
  splitDisplayName,
  parsePosition,
  isWithdrawn as competitorIsWithdrawn,
  madeCut,
  parsePurse,
  extractEarnings,
} from "./client";
import { getProjectedEarnings } from "@/lib/golf/payout-table";

export async function syncResults() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Safety net: close any tournament whose end_date passed > 1 day ago but is
  // still flagged as live (happens when API calls fail, e.g. 403 errors).
  await db.execute(sql`
    UPDATE tournaments
    SET is_over = true, is_in_progress = false, updated_at = ${now}
    WHERE canceled = false
      AND is_over  = false
      AND end_date IS NOT NULL
      AND end_date < ${yesterday}
  `);

  // Find tournaments that need syncing (same criteria as sportsdata version)
  const activeTournaments = await db
    .select()
    .from(tournaments)
    .where(
      and(
        eq(tournaments.canceled, false),
        or(
          eq(tournaments.isInProgress, true),
          eq(tournaments.isOver, false),
          and(eq(tournaments.isOver, true), gte(tournaments.updatedAt, sevenDaysAgo))
        )
      )
    );

  // Filter to tournaments that have started
  const tournamentsToSync = activeTournaments.filter(
    (t) => new Date(t.startDate) <= now
  );

  const results = [];

  for (const tournament of tournamentsToSync) {
    try {
      const data = await fetchEventLeaderboard(tournament.externalTournamentId);

      // ESPN returns a tournaments array; find the matching event
      const espnTournament =
        data.tournaments?.find(
          (t) => parseInt(t.id, 10) === tournament.externalTournamentId
        ) ?? data.tournaments?.[0];

      if (!espnTournament) {
        results.push({
          tournament: tournament.name,
          error: "Event not found in ESPN response",
          resultsCount: 0,
        });
        continue;
      }

      const isOver =
        espnTournament.status.type.completed &&
        espnTournament.status.type.state === "post";
      const isInProgress = espnTournament.status.type.state === "in";

      // Update tournament status and purse
      const updateFields: Record<string, unknown> = {
        isOver,
        isInProgress,
        updatedAt: now,
      };
      const newPurse = parsePurse(espnTournament.purse);
      if (newPurse && parseFloat(newPurse) > 0) {
        updateFields.purse = newPurse;
      }
      // Update venue/course if we now have it
      if (espnTournament.venue?.fullName) {
        updateFields.venue = espnTournament.venue.fullName;
      }
      if (espnTournament.courses?.[0]?.name) {
        updateFields.courseName = espnTournament.courses[0].name;
      }
      if (espnTournament.courses?.[0]?.par) {
        updateFields.par = espnTournament.courses[0].par;
      }

      await db
        .update(tournaments)
        .set(updateFields)
        .where(eq(tournaments.id, tournament.id));

      const players = espnTournament.competitors ?? [];
      let resultsCount = 0;

      if (players.length > 0) {
        // Build a map of ESPN athlete ID → internal golfer ID
        const espnIds = players.map((p) => parseInt(p.id, 10)).filter((n) => !isNaN(n));

        const golferRows =
          espnIds.length > 0
            ? await db
                .select({ id: golfers.id, externalPlayerId: golfers.externalPlayerId })
                .from(golfers)
                .where(inArray(golfers.externalPlayerId, espnIds))
            : [];

        const golferMap = new Map(golferRows.map((g) => [g.externalPlayerId, g.id]));

        // For unmatched players, try name-based lookup then insert
        const missingPlayers = players.filter(
          (p) => !golferMap.has(parseInt(p.id, 10))
        );

        for (const p of missingPlayers) {
          const espnId = parseInt(p.id, 10);
          if (isNaN(espnId)) continue;

          const { firstName, lastName } = splitDisplayName(p.athlete.displayName);
          try {
            // Try name-based match first (existing golfer with SportsData ID)
            const [byName] = await db
              .select({ id: golfers.id })
              .from(golfers)
              .where(
                and(
                  eq(golfers.firstName, firstName),
                  eq(golfers.lastName, lastName)
                )
              )
              .limit(1);

            if (byName) {
              // Update externalPlayerId to ESPN ID
              await db
                .update(golfers)
                .set({ externalPlayerId: espnId, updatedAt: now })
                .where(eq(golfers.id, byName.id));
              golferMap.set(espnId, byName.id);
            } else {
              // Insert new golfer with ESPN ID
              const country =
                p.athlete.flag?.alt ?? p.athlete.flag?.countryCode ?? null;
              const photoUrl = p.athlete.headshot?.href ?? null;

              const [inserted] = await db
                .insert(golfers)
                .values({
                  externalPlayerId: espnId,
                  firstName,
                  lastName,
                  country,
                  photoUrl,
                })
                .onConflictDoNothing({ target: golfers.externalPlayerId })
                .returning({ id: golfers.id });

              if (inserted) {
                golferMap.set(espnId, inserted.id);
              } else {
                const [existing] = await db
                  .select({ id: golfers.id })
                  .from(golfers)
                  .where(eq(golfers.externalPlayerId, espnId))
                  .limit(1);
                if (existing) golferMap.set(espnId, existing.id);
              }
            }
          } catch (err) {
            console.error(`Failed to upsert golfer ${p.athlete.displayName}:`, err);
          }
        }

        // Build result rows for all matched players
        const matchedPlayers = players.filter((p) =>
          golferMap.has(parseInt(p.id, 10))
        );

        if (matchedPlayers.length > 0) {
          const BATCH_SIZE = 200;
          for (let i = 0; i < matchedPlayers.length; i += BATCH_SIZE) {
            const batch = matchedPlayers.slice(i, i + BATCH_SIZE);
            await db
              .insert(tournamentResults)
              .values(
                batch.map((p) => {
                  const espnId = parseInt(p.id, 10);
                  const pos = p.status?.position?.shortDisplayName;
                  const wd = competitorIsWithdrawn(pos);
                  const earnings = extractEarnings(p.statistics) ?? 0;

                  return {
                    tournamentId: tournament.id,
                    golferId: golferMap.get(espnId)!,
                    position: parsePosition(pos),
                    earnings: earnings.toString(),
                    totalScore: null, // ESPN provides score-to-par, not total strokes
                    totalScoreToPar: p.score?.value != null
                      ? Math.round(p.score.value)
                      : null,
                    madeCut: madeCut(pos, isOver),
                    isWithdrawn: wd,
                    rounds: p.linescores?.length ?? 0,
                  };
                })
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
                  updatedAt: now,
                },
              });
          }
          resultsCount = matchedPlayers.length;
        }
      }

      // Update cached earnings on picks for this tournament
      if (isOver || isInProgress) {
        await updatePickEarnings(tournament.id);
      }

      results.push({
        tournament: tournament.name,
        isOver,
        resultsCount,
      });
    } catch (error) {
      console.error(`Failed to sync results for ${tournament.name}:`, error);
      // If the API failed but this tournament's end date has passed, mark it
      // as over so it stops appearing as LIVE on the site.
      if (tournament.endDate && new Date(tournament.endDate) < yesterday) {
        try {
          await db
            .update(tournaments)
            .set({ isOver: true, isInProgress: false, updatedAt: now })
            .where(eq(tournaments.id, tournament.id));
        } catch (closeErr) {
          console.error(`Failed to auto-close ${tournament.name}:`, closeErr);
        }
      }
      results.push({
        tournament: tournament.name,
        error: String(error),
        resultsCount: 0,
      });
    }
  }

  return results;
}

export async function updatePickEarnings(tournamentId: number) {
  const [tournament] = await db
    .select({ purse: tournaments.purse })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);
  const purse = parseFloat(tournament?.purse ?? "0") || 0;

  const allResults = await db
    .select({
      golferId: tournamentResults.golferId,
      earnings: tournamentResults.earnings,
      totalScoreToPar: tournamentResults.totalScoreToPar,
      isWithdrawn: tournamentResults.isWithdrawn,
      computedPosition: sql<number>`RANK() OVER (
        ORDER BY
          CASE WHEN ${tournamentResults.isWithdrawn} THEN 1 ELSE 0 END,
          ${tournamentResults.totalScoreToPar} ASC NULLS LAST
      )`,
    })
    .from(tournamentResults)
    .where(eq(tournamentResults.tournamentId, tournamentId));

  const positionCounts = new Map<number, number>();
  for (const r of allResults) {
    if (r.computedPosition != null) {
      positionCounts.set(
        r.computedPosition,
        (positionCounts.get(r.computedPosition) || 0) + 1
      );
    }
  }
  const resultMap = new Map(allResults.map((r) => [r.golferId, r]));

  const tournamentPicks = await db
    .select()
    .from(picks)
    .where(eq(picks.tournamentId, tournamentId));

  for (const pick of tournamentPicks) {
    const activeGolferId = pick.activeGolferId ?? pick.primaryGolferId;
    const result = resultMap.get(activeGolferId);

    let earnings = parseFloat(result?.earnings || "0") || 0;

    if (
      earnings === 0 &&
      result &&
      result.computedPosition > 0 &&
      purse > 0 &&
      !result.isWithdrawn
    ) {
      const tiedCount = positionCounts.get(result.computedPosition) || 1;
      earnings = getProjectedEarnings(purse, result.computedPosition, tiedCount);
    }

    await db
      .update(picks)
      .set({ earnings: earnings.toString(), updatedAt: new Date() })
      .where(eq(picks.id, pick.id));
  }
}
