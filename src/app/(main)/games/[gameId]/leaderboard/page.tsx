import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getGameById, getUserRole } from "@/lib/queries/games";
import { getCurrentTournament } from "@/lib/queries/tournaments";
import {
  getSeasonLeaderboard,
  getSubGameLeaderboard,
  getWeeklyLeaderboard,
} from "@/lib/queries/leaderboard";
import { getSubGames } from "@/lib/actions/sub-games";
import { LeaderboardClient } from "./leaderboard-client";

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId: gidStr } = await params;
  const gameId = parseInt(gidStr);
  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session!.user!.id;

  const [game, role, currentTournament, subGamesList] = await Promise.all([
    getGameById(gameId),
    getUserRole(gameId, userId),
    getCurrentTournament(),
    getSubGames(gameId),
  ]);
  if (!game || !role) notFound();

  // Build all leaderboard options
  const boardFetches: { id: string; label: string; promise: Promise<any> }[] = [
    {
      id: "season",
      label: `Season-Long (${game.seasonYear})`,
      promise: getSeasonLeaderboard(gameId),
    },
  ];

  if (currentTournament) {
    boardFetches.push({
      id: `weekly-${currentTournament.id}`,
      label: `This Week: ${currentTournament.name}`,
      promise: getWeeklyLeaderboard(gameId, currentTournament.id),
    });
  }

  for (const sg of subGamesList) {
    boardFetches.push({
      id: `sub-${sg.id}`,
      label: sg.name,
      promise: getSubGameLeaderboard(gameId, sg.id),
    });
  }

  const results = await Promise.all(boardFetches.map((b) => b.promise));

  const options = boardFetches.map((b, i) => ({
    id: b.id,
    label: b.label,
    entries: results[i],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="text-sm text-neutral-500">{game.name}</p>
      </div>

      <LeaderboardClient
        options={options}
        currentUserId={userId}
        defaultBoard="season"
      />
    </div>
  );
}
