import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  fetchCurrentSeason,
  fetchTournamentsBySeason,
  fetchLeaderboard,
} from "@/lib/sportsdata/client";
import { matchesTournamentName } from "@/lib/sportsdata/tournament-match";

interface GolferYearResult {
  year: number;
  position: number;
  totalScoreToPar: number;
  earnings: number;
  madeCut: boolean;
}

const getGolferTournamentHistory = unstable_cache(
  async (
    tournamentName: string,
    firstName: string,
    lastName: string
  ): Promise<GolferYearResult[]> => {
    const currentSeason = await fetchCurrentSeason();
    const currentYear = currentSeason.Season;
    const results: GolferYearResult[] = [];

    for (const year of [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]) {
      try {
        const tournaments = await fetchTournamentsBySeason(year);
        const match = tournaments.find((t) =>
          matchesTournamentName(t.Name, tournamentName)
        );
        if (!match) continue;

        const leaderboard = await fetchLeaderboard(match.TournamentID);
        const player = leaderboard.Players.find(
          (p) =>
            p.FirstName.toLowerCase() === firstName.toLowerCase() &&
            p.LastName.toLowerCase() === lastName.toLowerCase()
        );
        if (!player) continue;

        results.push({
          year,
          position: player.Rank,
          totalScoreToPar: player.TotalScore,
          earnings: player.Earnings,
          madeCut: player.MadeCut === 1,
        });
      } catch {
        // Skip years where API call fails
      }
    }

    return results;
  },
  ["golfer-tournament-history-v2"],
  { revalidate: 86400 }
);

export async function GET(request: NextRequest) {
  const tournamentName = request.nextUrl.searchParams.get("tournamentName");
  const firstName = request.nextUrl.searchParams.get("firstName");
  const lastName = request.nextUrl.searchParams.get("lastName");

  if (!tournamentName || !firstName || !lastName) {
    return NextResponse.json(
      { error: "tournamentName, firstName, and lastName are required" },
      { status: 400 }
    );
  }

  try {
    const results = await getGolferTournamentHistory(
      tournamentName,
      firstName,
      lastName
    );
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch golfer results" },
      { status: 500 }
    );
  }
}
