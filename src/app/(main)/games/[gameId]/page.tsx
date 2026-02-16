import Link from "next/link";
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getGameById, getUserRole } from "@/lib/queries/games";
import { getCurrentTournament } from "@/lib/queries/tournaments";
import { getSeasonLeaderboard } from "@/lib/queries/leaderboard";
import { getUserPick } from "@/lib/actions/picks";
import { getSubGames } from "@/lib/actions/sub-games";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Settings, Trophy, Calendar, Users } from "lucide-react";

export default async function GameHomePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId: gameIdStr } = await params;
  const gameId = parseInt(gameIdStr);
  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session!.user!.id;

  const [game, role, leaderboard, currentTournament, subGamesList] =
    await Promise.all([
      getGameById(gameId),
      getUserRole(gameId, userId),
      getSeasonLeaderboard(gameId),
      getCurrentTournament(),
      getSubGames(gameId),
    ]);

  if (!game || !role) notFound();

  const currentPick = currentTournament
    ? await getUserPick(gameId, currentTournament.id)
    : null;

  const isManager = role === "manager";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{game.name}</h1>
          <p className="text-sm text-neutral-500">
            {game.seasonYear} Season
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/games/${gameId}/members`}>
              <Users className="mr-1.5 h-4 w-4" />
              Members
            </Link>
          </Button>
          {isManager && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/games/${gameId}/settings`}>
                <Settings className="mr-1.5 h-4 w-4" />
                Settings
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Current Tournament & Pick */}
      {currentTournament && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-green-600" />
                <CardDescription>
                  {currentTournament.isInProgress
                    ? "In Progress"
                    : "Upcoming"}
                </CardDescription>
              </div>
              {currentTournament.firstTeeTime && (
                <Badge variant="outline">
                  Locks: {formatDate(currentTournament.firstTeeTime)}
                </Badge>
              )}
            </div>
            <CardTitle>{currentTournament.name}</CardTitle>
          </CardHeader>
          <CardContent>
            {currentPick ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-600">
                  Pick submitted for this tournament
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/games/${gameId}/picks/${currentTournament.id}`}
                  >
                    View / Change Pick
                  </Link>
                </Button>
              </div>
            ) : (
              <Button
                asChild
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Link
                  href={`/games/${gameId}/picks/${currentTournament.id}`}
                >
                  Make Your Pick
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Season Leaderboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-green-600" />
              <CardTitle className="text-lg">Season Leaderboard</CardTitle>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/games/${gameId}/leaderboard`}>View All</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-500">
              No picks made yet. Be the first to make a pick!
            </p>
          ) : (
            <div className="space-y-2">
              {leaderboard.slice(0, 10).map((entry) => (
                <div
                  key={entry.userId}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    entry.userId === userId
                      ? "bg-green-50 font-medium"
                      : "bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-bold text-neutral-400">
                      {entry.rank}
                    </span>
                    <span className="text-sm">{entry.userName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-500">
                      {entry.pickCount} picks
                    </span>
                    <span className="text-sm font-semibold text-green-700">
                      {formatCurrency(entry.totalEarnings)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sub-games */}
      {subGamesList.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {subGamesList.map((sg) => (
            <Link key={sg.id} href={`/games/${gameId}/leaderboard/${sg.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">{sg.name}</CardTitle>
                  {sg.description && (
                    <CardDescription>{sg.description}</CardDescription>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pick History Link */}
      <div className="text-center">
        <Button asChild variant="ghost">
          <Link href={`/games/${gameId}/picks`}>View Full Pick History</Link>
        </Button>
      </div>
    </div>
  );
}
