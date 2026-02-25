import Link from "next/link";
import { auth } from "@/auth";
import { getUserGames } from "@/lib/actions/games";
import { getCurrentTournament } from "@/lib/queries/tournaments";
import { getUserPicksForTournament } from "@/lib/actions/picks";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Trophy, Calendar, Clock, Check } from "lucide-react";
import { formatDeadline, getTournamentLockTime } from "@/lib/utils";
import { AccessCodeForm } from "./access-code-form";

export default async function DashboardPage() {
  const session = await auth();
  const games = await getUserGames();
  const currentTournament = await getCurrentTournament();

  // Fetch all picks for current tournament across all games in one query
  const picksByGame = currentTournament
    ? await getUserPicksForTournament(
        currentTournament.id,
        games.map((g) => g.gameId)
      )
    : {};

  const pickDeadline = currentTournament
    ? getTournamentLockTime(currentTournament)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-neutral-500">
          Welcome back, {session?.user?.name?.split(" ")[0]}
        </p>
        <h1 className="text-2xl font-bold">Leagues</h1>
      </div>

      {games.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="mb-4 h-12 w-12 text-neutral-300" />
            <h3 className="mb-1 text-lg font-semibold">No leagues yet</h3>
            <p className="mb-4 text-sm text-neutral-500">
              Enter your access code to join a league.
            </p>
            <AccessCodeForm />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {games.map((game) => (
              <Link key={game.gameId} href={`/games/${game.gameId}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{game.gameName}</CardTitle>
                  </CardHeader>
                  {currentTournament && (
                    <CardContent className="space-y-1.5 text-sm text-neutral-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-green-600" />
                        <span>{currentTournament.name}</span>
                      </div>
                      {pickDeadline && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-amber-600" />
                          <span>Picks lock {formatDeadline(pickDeadline)}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-1.5 pt-1">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                        {picksByGame[game.gameId] ? (
                          <span>
                            Your pick: {picksByGame[game.gameId].primaryName}
                            {picksByGame[game.gameId].alternateName && (
                              <span className="text-neutral-400">
                                {" "}(Alt: {picksByGame[game.gameId].alternateName})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-neutral-400">
                            No pick entered yet
                          </span>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
