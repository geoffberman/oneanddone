import { auth } from "@/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getGameById, getUserRole } from "@/lib/queries/games";
import { getCurrentTournament } from "@/lib/queries/tournaments";
import {
  getSeasonLeaderboard,
  getWeeklyLeaderboard,
  getCurrentTournamentPickNames,
  getLiveScoresForGame,
  getUsersWithPickForTournament,
  type LeaderboardEntry,
} from "@/lib/queries/leaderboard";
import { getCustomLeaderboardById } from "@/lib/actions/custom-leaderboards";
import { getProjectedEarnings } from "@/lib/golf/payout-table";
import { getTournamentLockTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { LeaderboardClient } from "../../leaderboard-client";

export default async function CustomLeaderboardViewPage({
  params,
}: {
  params: Promise<{ gameId: string; customId: string }>;
}) {
  const { gameId: gidStr, customId: cidStr } = await params;
  const gameId = parseInt(gidStr);
  const customId = parseInt(cidStr);

  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session.user.id;

  const [game, role, customLb, currentTournament] = await Promise.all([
    getGameById(gameId),
    getUserRole(gameId, userId),
    getCustomLeaderboardById(customId),
    getCurrentTournament(),
  ]);
  if (!game || !role || !customLb) notFound();

  const userIdFilter = customLb.memberUserIds;

  // Build leaderboard options filtered to the custom member list
  const seasonEntries = await getSeasonLeaderboard(gameId, {
    currentTournamentId: currentTournament?.id,
    userIdFilter,
  });

  const options: { id: string; label: string; type: "season" | "weekly" | "sub"; entries: LeaderboardEntry[] }[] = [
    {
      id: "season",
      label: `Season-Long`,
      type: "season",
      entries: seasonEntries,
    },
  ];

  if (currentTournament) {
    const weeklyEntries = await getWeeklyLeaderboard(gameId, currentTournament.id);
    options.push({
      id: `weekly-${currentTournament.id}`,
      label: `This Week: ${currentTournament.name}`,
      type: "weekly",
      // Filter to custom members
      entries: weeklyEntries.filter((e) => userIdFilter.includes(e.userId)),
    });
  }

  // Mark hasCurrentPick
  const currentPickUsers = currentTournament
    ? await getUsersWithPickForTournament(gameId, currentTournament.id)
    : new Set<string>();
  for (const option of options) {
    option.entries = option.entries.map((e) => ({
      ...e,
      hasCurrentPick: currentPickUsers.has(e.userId),
    }));
  }

  const isLocked = currentTournament
    ? new Date() >= getTournamentLockTime(currentTournament)
    : false;
  const isInProgress = currentTournament?.isInProgress ?? false;
  const purse = parseFloat(currentTournament?.purse ?? "0") || 0;

  if (isLocked && currentTournament) {
    const [pickMap, liveMap] = await Promise.all([
      getCurrentTournamentPickNames(gameId, currentTournament.id),
      getLiveScoresForGame(gameId, currentTournament.id),
    ]);
    const isWeeklyId = `weekly-${currentTournament.id}`;
    for (const option of options) {
      const isWeekly = option.id === isWeeklyId;
      const isSeason = option.type === "season";
      const enriched = option.entries.map((e) => {
        const live = liveMap.get(e.userId);
        let liveEarnings = parseFloat(live?.earnings ?? "0") || 0;
        if (liveEarnings === 0 && live?.position && live.position > 0 && purse > 0 && !live.isWithdrawn) {
          liveEarnings = getProjectedEarnings(purse, live.position, live.tiedCount);
        }
        let totalEarnings: string;
        if (isWeekly) {
          totalEarnings = liveEarnings > 0 ? liveEarnings.toFixed(0) : e.totalEarnings;
        } else if (isSeason) {
          const cachedCurrent = parseFloat(e.currentTournamentEarnings ?? "0") || 0;
          const base = (parseFloat(e.totalEarnings) || 0) - cachedCurrent;
          const effectiveCurrent = liveEarnings > 0 ? liveEarnings : cachedCurrent;
          totalEarnings = (base + effectiveCurrent).toFixed(0);
        } else {
          totalEarnings = e.totalEarnings;
        }
        return {
          ...e,
          totalEarnings,
          currentPickName: pickMap.get(e.userId)?.name ?? null,
          currentPickIsAlternate: pickMap.get(e.userId)?.isAlternate ?? false,
          livePosition: live?.position ?? null,
          liveIsTied: live?.isTied ?? false,
          liveTiedCount: live?.tiedCount ?? 1,
          liveTotalScoreToPar: live?.totalScoreToPar ?? null,
          liveMadeCut: live?.madeCut ?? null,
          liveIsWithdrawn: live?.isWithdrawn ?? null,
          liveRounds: live?.rounds ?? null,
        };
      });

      const hasLivePositions = isInProgress && isWeekly &&
        enriched.some((e) => e.livePosition != null && e.livePosition > 0);
      if (hasLivePositions) {
        enriched.sort((a, b) => {
          const aWD = a.liveIsWithdrawn ?? false;
          const bWD = b.liveIsWithdrawn ?? false;
          const aMC = a.liveMadeCut === false;
          const bMC = b.liveMadeCut === false;
          if (aWD !== bWD) return aWD ? 1 : -1;
          if (aMC !== bMC) return aMC ? 1 : -1;
          const ap = a.livePosition ?? 9999;
          const bp = b.livePosition ?? 9999;
          return ap - bp;
        });
      } else if (isSeason || !isWeekly) {
        enriched.sort(
          (a, b) => (parseFloat(b.totalEarnings) || 0) - (parseFloat(a.totalEarnings) || 0)
        );
      }

      option.entries = enriched.map((e, i) => ({ ...e, rank: i + 1 }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/games/${gameId}/leaderboard/custom`}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Custom Leaderboards
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{customLb.name}</h1>
          {!customLb.isOwner && (
            <Badge variant="secondary">Shared with me</Badge>
          )}
        </div>
      </div>

      <LeaderboardClient
        options={options}
        currentUserId={userId}
        isLocked={isLocked}
        isInProgress={isInProgress}
      />
    </div>
  );
}
