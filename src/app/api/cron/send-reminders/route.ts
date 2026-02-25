import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, games, gameMembers, users, picks, seasons } from "@/db/schema";
import { eq, and, gte, lte, isNull, notInArray } from "drizzle-orm";
import { sendPicksReminderEmail } from "@/lib/email";
import { getTournamentLockTime } from "@/lib/utils";

// Runs daily at 8 AM ET. Finds tournaments whose picks deadline falls in the
// next 20–28 hours (i.e., roughly 24 hours away) and emails members who
// haven't yet submitted a pick.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 20 * 60 * 60 * 1000); // 20h from now
  const windowEnd = new Date(now.getTime() + 28 * 60 * 60 * 1000);   // 28h from now

  try {
    // Find tournaments whose deadline (firstTeeTime, or startDate as fallback)
    // falls within the 20–28 hour window
    const allTournaments = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        firstTeeTime: tournaments.firstTeeTime,
        startDate: tournaments.startDate,
        seasonId: tournaments.seasonId,
      })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.isOver, false),
          eq(tournaments.canceled, false)
        )
      );

    const upcoming = allTournaments.filter((t) => {
      const d = getTournamentLockTime(t);
      return d >= windowStart && d <= windowEnd;
    });

    if (upcoming.length === 0) {
      return NextResponse.json({ sent: 0, message: "No tournaments in reminder window" });
    }

    // Get all active games
    const allGames = await db
      .select({
        id: games.id,
        name: games.name,
        seasonId: games.seasonId,
      })
      .from(games)
      .where(eq(games.isActive, true));

    let totalSent = 0;

    for (const tournament of upcoming) {
      const deadline = getTournamentLockTime(tournament);

      // Games in the same season as this tournament
      const relevantGames = allGames.filter(
        (g) => g.seasonId === tournament.seasonId
      );

      for (const game of relevantGames) {
        // Members who have already picked for this tournament
        const pickedRows = await db
          .select({ userId: picks.userId })
          .from(picks)
          .where(
            and(
              eq(picks.gameId, game.id),
              eq(picks.tournamentId, tournament.id)
            )
          );
        const pickedUserIds = pickedRows.map((p) => p.userId);

        // Members who have NOT picked
        const memberQuery = db
          .select({
            name: users.name,
            displayName: users.displayName,
            email: users.email,
            userId: gameMembers.userId,
          })
          .from(gameMembers)
          .innerJoin(users, eq(gameMembers.userId, users.id))
          .where(eq(gameMembers.gameId, game.id));

        const allMembers = await memberQuery;
        const unpickedMembers = pickedUserIds.length > 0
          ? allMembers.filter((m) => !pickedUserIds.includes(m.userId))
          : allMembers;

        for (const member of unpickedMembers) {
          if (!member.email) continue;
          const name = member.displayName || member.name || "there";
          await sendPicksReminderEmail(
            member.email,
            name,
            game.name,
            game.id,
            tournament.name,
            deadline,
          );
          totalSent++;
        }
      }
    }

    return NextResponse.json({ sent: totalSent });
  } catch (error) {
    console.error("send-reminders cron error:", error);
    return NextResponse.json(
      { error: "Failed to send reminders" },
      { status: 500 }
    );
  }
}
