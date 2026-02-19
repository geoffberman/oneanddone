import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getGameById, getUserRole } from "@/lib/queries/games";
import { getCurrentTournament } from "@/lib/queries/tournaments";
import {
  getSeasonLeaderboard,
  getSubGameLeaderboard,
  getWeeklyLeaderboard,
  getCurrentTournamentPickNames,
  getLiveScoresForGame,
  type LeaderboardEntry,
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

  // After picks lock, attach each member's current tournament pick + live scores
  const lockTime = currentTournament
    ? currentTournament.firstTeeTime || currentTournament.startDate
    : null;
  const isLocked = lockTime ? new Date() >= new Date(lockTime) : false;
  const isInProgress = currentTournament?.isInProgress ?? false;

  if (isLocked && currentTournament) {
    const [pickMap, liveMap] = await Promise.all([
      getCurrentTournamentPickNames(gameId, currentTournament.id),
      getLiveScoresForGame(gameId, currentTournament.id),
    ]);
    for (const option of options) {
      const enriched = (option.entries as LeaderboardEntry[]).map((e) => {
        const live = liveMap.get(e.userId);
        return {
          ...e,
          // During a live tournament, show current earnings from tournament_results
          // rather than picks.earnings (which is only updated after the tournament ends)
          totalEarnings: live?.earnings ?? e.totalEarnings,
          currentPickName: pickMap.get(e.userId)?.name ?? null,
          currentPickIsAlternate: pickMap.get(e.userId)?.isAlternate ?? false,
          livePosition: live?.position ?? null,
          liveTotalScoreToPar: live?.totalScoreToPar ?? null,
          liveMadeCut: live?.madeCut ?? null,
          liveIsWithdrawn: live?.isWithdrawn ?? null,
          liveRounds: live?.rounds ?? null,
        };
      });

      // During a live tournament, re-sort the weekly leaderboard by live score
      // (earnings stay $0 until the tournament finishes, so they're useless for ranking)
      if (isInProgress && option.id === `weekly-${currentTournament.id}`) {
        enriched.sort((a, b) => {
          const aWD = a.liveIsWithdrawn ?? false;
          const bWD = b.liveIsWithdrawn ?? false;
          const aMC = a.liveMadeCut === false;
          const bMC = b.liveMadeCut === false;

          // WD last, MC second-to-last
          if (aWD !== bWD) return aWD ? 1 : -1;
          if (aMC !== bMC) return aMC ? 1 : -1;

          // Active players: sort by score-to-par ascending (null = hasn't teed off → worst)
          const aScore = a.liveTotalScoreToPar;
          const bScore = b.liveTotalScoreToPar;
          if (aScore == null && bScore == null) return 0;
          if (aScore == null) return 1;
          if (bScore == null) return -1;
          return aScore - bScore;
        });

        // Re-assign ranks, giving tied scores the same rank
        let rank = 1;
        for (let i = 0; i < enriched.length; i++) {
          if (i > 0) {
            const prev = enriched[i - 1];
            const curr = enriched[i];
            const sameTier =
              (prev.liveIsWithdrawn ?? false) === (curr.liveIsWithdrawn ?? false) &&
              (prev.liveMadeCut === false) === (curr.liveMadeCut === false) &&
              prev.liveTotalScoreToPar === curr.liveTotalScoreToPar;
            if (!sameTier) rank = i + 1;
          }
          enriched[i] = { ...enriched[i], rank };
        }
      }

      option.entries = enriched;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="text-sm text-neutral-500">{game.name}</p>
      </div>

      <LeaderboardClient
        options={options}
        currentUserId={userId}
        defaultBoard={isInProgress && currentTournament ? `weekly-${currentTournament.id}` : "season"}
        isLocked={isLocked}
        isInProgress={isInProgress}
      />
    </div>
  );
}
