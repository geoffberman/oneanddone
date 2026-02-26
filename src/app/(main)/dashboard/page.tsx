import Link from "next/link";
import { auth } from "@/auth";
import { getUserGames } from "@/lib/actions/games";
import { getCurrentTournament } from "@/lib/queries/tournaments";
import { getUserPicksForTournament } from "@/lib/actions/picks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Plus } from "lucide-react";
import { formatDeadline, getTournamentLockTime } from "@/lib/utils";
import { AccessCodeForm } from "./access-code-form";
import { GameTile } from "./game-tile";

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

  const formattedDeadline = pickDeadline ? formatDeadline(pickDeadline) : null;
  const firstName = session?.user?.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      {/* App header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight">
            Geoff&apos;s Magic One and Done App
          </h1>
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
        <>
          <h2 className="text-lg font-semibold">Leagues</h2>
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
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">Leagues</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {games.map((game) => {
              const pick = picksByGame[game.gameId];
              return (
                <GameTile
                  key={game.gameId}
                  gameId={game.gameId}
                  gameName={game.gameName}
                  isManager={game.role === "manager"}
                  currentTournamentName={currentTournament?.name ?? null}
                  pickDeadline={formattedDeadline}
                  pickPrimaryName={pick?.primaryName ?? null}
                  pickAlternateName={pick?.alternateName ?? null}
                />
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
