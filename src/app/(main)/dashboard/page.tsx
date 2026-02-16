import Link from "next/link";
import { auth } from "@/auth";
import { getUserGames } from "@/lib/actions/games";
import { getCurrentTournament } from "@/lib/queries/tournaments";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, UserPlus, Trophy, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  const games = await getUserGames();
  const currentTournament = await getCurrentTournament();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-neutral-500">
            Welcome back, {session?.user?.name?.split(" ")[0]}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/games/join">
              <UserPlus className="mr-1.5 h-4 w-4" />
              Join Game
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-green-600 hover:bg-green-700"
          >
            <Link href="/games/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Game
            </Link>
          </Button>
        </div>
      </div>

      {currentTournament && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-600" />
              <CardDescription>
                {currentTournament.isInProgress
                  ? "In Progress"
                  : "Upcoming Tournament"}
              </CardDescription>
            </div>
            <CardTitle>{currentTournament.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 text-sm text-neutral-600">
              <span>{currentTournament.venue}</span>
              <span>{currentTournament.location}</span>
              <span>{formatDate(currentTournament.startDate)}</span>
              {currentTournament.purse && (
                <span>
                  Purse: $
                  {Number(currentTournament.purse).toLocaleString()}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {games.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="mb-4 h-12 w-12 text-neutral-300" />
            <h3 className="mb-1 text-lg font-semibold">No games yet</h3>
            <p className="mb-4 text-sm text-neutral-500">
              Create a new game or join an existing one to get started.
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/games/join">Join Game</Link>
              </Button>
              <Button
                asChild
                className="bg-green-600 hover:bg-green-700"
              >
                <Link href="/games/new">Create Game</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {games.map((game) => (
            <Link key={game.gameId} href={`/games/${game.gameId}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{game.gameName}</CardTitle>
                    <Badge variant={game.role === "manager" ? "default" : "secondary"}>
                      {game.role}
                    </Badge>
                  </div>
                  <CardDescription>
                    {game.seasonYear} Season
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
