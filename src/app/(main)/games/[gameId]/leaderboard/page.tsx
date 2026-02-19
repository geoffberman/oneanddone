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
  const boardFetches: { id: string; label: string; type: "season" | "weekly" | "sub"; promise: Promise<any> }[] = [
    {
      id: "season",
      label: `Season-Long (${game.seasonYear})`,
      type: "season",
      // Pass current tournament ID so we can swap cached earnings for real-time live earnings
      promise: getSeasonLeaderboard(gameId, currentTournament ? { currentTournamentId: currentTournament.id } : undefined),
    },
  ];

  if (currentTournament) {
    boardFetches.push({
      id: `weekly-${currentTournament.id}`,
      label: `This Week: ${currentTournament.name}`,
      type: "weekly",
      promise: getWeeklyLeaderboard(gameId, currentTournament.id),
    });
  }

  for (const sg of subGamesList) {
    boardFetches.push({
      id: `sub-${sg.id}`,
      label: sg.name,
      type: "sub",
      promise: getSubGameLeaderboard(gameId, sg.id),
    });
  }

  const results = await Promise.all(boardFetches.map((b) => b.promise));

  const options = boardFetches.map((b, i) => ({
    id: b.id,
    label: b.label,
    type: b.type,
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
    const isWeeklyId = `weekly-${currentTournament.id}`;
    for (const option of options) {
      const isWeekly = option.id === isWeeklyId;
      const isSeason = option.type === "season";
      const enriched = (option.entries as LeaderboardEntry[]).map((e) => {
        const live = liveMap.get(e.userId);
        const liveEarnings = parseFloat(live?.earnings ?? "0") || 0;
        let totalEarnings: string;
        if (isWeekly) {
          // Weekly board: show live earnings for this tournament
          totalEarnings = live?.earnings ?? e.totalEarnings;
        } else if (isSeason) {
          // Season board: (total season – cached current tournament) + real-time live earnings
          const base = (parseFloat(e.totalEarnings) || 0) - (parseFloat(e.currentTournamentEarnings ?? "0") || 0);
          totalEarnings = (base + liveEarnings).toFixed(0);
        } else {
          totalEarnings = e.totalEarnings;
        }
        return {
          ...e,
          totalEarnings,
          currentPickName: pickMap.get(e.userId)?.name ?? null,
          currentPickIsAlternate: pickMap.get(e.userId)?.isAlternate ?? false,
          livePosition: live?.position ?? null,
          liveTotalScoreToPar: live?.totalScoreToPar ?? null,
          liveMadeCut: live?.madeCut ?? null,
          liveIsWithdrawn: live?.isWithdrawn ?? null,
          liveRounds: live?.rounds ?? null,
        };
      });

      // During a live tournament, re-sort the weekly leaderboard by each
      // golfer's current tournament position (lower = better).
      const hasLivePositions = isInProgress && isWeekly &&
        enriched.some((e) => e.livePosition != null && e.livePosition > 0);
      if (hasLivePositions) {
        enriched.sort((a, b) => {
          const aWD = a.liveIsWithdrawn ?? false;
          const bWD = b.liveIsWithdrawn ?? false;
          const aMC = a.liveMadeCut === false;
          const bMC = b.liveMadeCut === false;

          // WD last, MC second-to-last
          if (aWD !== bWD) return aWD ? 1 : -1;
          if (aMC !== bMC) return aMC ? 1 : -1;

          // Sort by tournament position ascending (null = no data yet → worst)
          const aPos = a.livePosition;
          const bPos = b.livePosition;
          if (aPos == null && bPos == null) return 0;
          if (aPos == null) return 1;
          if (bPos == null) return -1;
          return aPos - bPos;
        });

        // Re-assign ranks — members whose golfers share the same position
        // get the same rank
        let rank = 1;
        for (let i = 0; i < enriched.length; i++) {
          if (i > 0) {
            const prev = enriched[i - 1];
            const curr = enriched[i];
            const sameTier =
              (prev.liveIsWithdrawn ?? false) === (curr.liveIsWithdrawn ?? false) &&
              (prev.liveMadeCut === false) === (curr.liveMadeCut === false) &&
              prev.livePosition === curr.livePosition;
            if (!sameTier) rank = i + 1;
          }
          enriched[i] = { ...enriched[i], rank };
        }
      }

      // Re-sort the season board after adding live earnings so ranks reflect real-time totals
      if (isSeason) {
        enriched.sort((a, b) => (parseFloat(b.totalEarnings) || 0) - (parseFloat(a.totalEarnings) || 0));
        enriched.forEach((e, i) => { e.rank = i + 1; });
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
