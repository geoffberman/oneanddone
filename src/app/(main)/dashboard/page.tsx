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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Calendar, Clock, Check, Plus } from "lucide-react";
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

  const firstName = session?.user?.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      {/* App header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Geoff&apos;s magic one and done app</h1>
          {firstName && (
            <p className="text-sm text-neutral-500">Welcome back, {firstName}</p>
          )}
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/games/new">
            <Plus className="mr-1.5 h-4 w-4" />
            Create Pool
          </Link>
        </Button>
      </div>

      {games.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="mb-4 h-12 w-12 text-neutral-300" />
            <h3 className="mb-1 text-lg font-semibold">No pools yet</h3>
            <p className="mb-4 text-sm text-neutral-500">
              Enter an access code to join a pool, or create your own.
            </p>
            <AccessCodeForm />
            <div className="relative my-4 w-full max-w-xs">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-neutral-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-neutral-400">or</span>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/games/new">
                <Plus className="mr-1.5 h-4 w-4" />
                Create Your Own Pool
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {games.map((game) => {
              const isManager = game.role === "manager";
              return (
                <Link key={game.gameId} href={`/games/${game.gameId}`}>
                  <Card
                    className={`transition-shadow hover:shadow-md ${
                      isManager
                        ? "border-amber-200 bg-amber-50 ring-1 ring-amber-100"
                        : ""
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-lg leading-tight">
                          {game.gameName}
                        </CardTitle>
                        {isManager && (
                          <Badge className="shrink-0 bg-amber-500 text-white hover:bg-amber-600">
                            Manager
                          </Badge>
                        )}
                      </div>
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
              );
            })}
          </div>

          {/* Bottom actions */}
          <div className="flex flex-wrap items-center gap-3">
            <AccessCodeForm />
          </div>
        </>
      )}
    </div>
  );
}
