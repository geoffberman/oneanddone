import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  fetchCurrentSeason,
  fetchTournamentsBySeason,
  fetchLeaderboard,
} from "@/lib/sportsdata/client";
import { matchesTournamentName } from "@/lib/sportsdata/tournament-match";

interface YearResult {
  year: number;
  results: {
    position: number;
    firstName: string;
    lastName: string;
    totalScoreToPar: number;
    earnings: number;
  }[];
}

const getTournamentHistory = unstable_cache(
  async (name: string): Promise<YearResult[]> => {
    const currentSeason = await fetchCurrentSeason();
    const currentYear = currentSeason.Season;
    const years: YearResult[] = [];

    for (const year of [currentYear - 1, currentYear - 2, currentYear - 3]) {
      try {
        const tournaments = await fetchTournamentsBySeason(year);
        const match = tournaments.find((t) =>
          matchesTournamentName(t.Name, name)
        );
        if (!match) continue;

        const leaderboard = await fetchLeaderboard(match.TournamentID);
        const top10 = leaderboard.Players.filter(
          (p) => p.Rank > 0 && p.MadeCut === 1
        )
          .sort((a, b) => a.Rank - b.Rank)
          .slice(0, 10)
          .map((p) => ({
            position: p.Rank,
            firstName: p.FirstName,
            lastName: p.LastName,
            totalScoreToPar: p.TotalScore,
            earnings: p.Earnings,
          }));

        if (top10.length > 0) {
          years.push({ year, results: top10 });
        }
      } catch {
        // Skip years where API call fails
      }
    }

    return years;
  },
  ["tournament-history-v2"],
  { revalidate: 86400 }
);

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const years = await getTournamentHistory(name);
    return NextResponse.json({ years });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch tournament history" },
      { status: 500 }
    );
  }
}
