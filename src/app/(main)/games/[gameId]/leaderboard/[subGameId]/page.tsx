import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { subGames } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getGameById, getUserRole } from "@/lib/queries/games";
import { getSubGameLeaderboard } from "@/lib/queries/leaderboard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/utils";
import { Trophy } from "lucide-react";

export default async function SubGameLeaderboardPage({
  params,
}: {
  params: Promise<{ gameId: string; subGameId: string }>;
}) {
  const { gameId: gidStr, subGameId: sgidStr } = await params;
  const gameId = parseInt(gidStr);
  const subGameId = parseInt(sgidStr);

  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session!.user!.id;

  const [game, role] = await Promise.all([
    getGameById(gameId),
    getUserRole(gameId, userId),
  ]);
  if (!game || !role) notFound();

  const [subGame] = await db
    .select()
    .from(subGames)
    .where(eq(subGames.id, subGameId))
    .limit(1);
  if (!subGame) notFound();

  const leaderboard = await getSubGameLeaderboard(gameId, subGameId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{subGame.name}</h1>
        <p className="text-sm text-neutral-500">
          {game.name} &middot; {subGame.description || "Sub-game leaderboard"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-green-600" />
            <CardTitle>Standings</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              No picks have been made for tournaments in this sub-game yet.
            </p>
          ) : (
            <div className="space-y-1">
              {leaderboard.map((entry) => {
                const isCurrentUser = entry.userId === userId;
                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center justify-between rounded-lg px-3 py-3 ${
                      isCurrentUser
                        ? "bg-green-50 ring-1 ring-green-200"
                        : "bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 text-center text-lg font-bold ${
                          entry.rank <= 3
                            ? "text-green-600"
                            : "text-neutral-400"
                        }`}
                      >
                        {entry.rank}
                      </span>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={entry.userImage || undefined} />
                        <AvatarFallback className="text-xs">
                          {entry.userName?.charAt(0)?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {entry.userName}
                          {isCurrentUser && (
                            <span className="ml-1 text-xs text-green-600">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {entry.pickCount} picks
                        </p>
                      </div>
                    </div>
                    <span className="text-base font-bold text-green-700">
                      {formatCurrency(entry.totalEarnings)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
