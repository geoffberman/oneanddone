import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getGameById, getUserRole } from "@/lib/queries/games";
import { getSubGames } from "@/lib/actions/sub-games";
import { getSeasonTournaments, getLatestSeason } from "@/lib/queries/tournaments";
import { db } from "@/db";
import { subGameTournaments } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId: gidStr } = await params;
  const gameId = parseInt(gidStr);
  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session!.user!.id;

  const [game, role] = await Promise.all([
    getGameById(gameId),
    getUserRole(gameId, userId),
  ]);
  if (!game || !role || role !== "manager") notFound();

  const [subGamesList, seasonTournaments] = await Promise.all([
    getSubGames(gameId),
    getSeasonTournaments(game.seasonId),
  ]);

  // Get tournament IDs for each sub-game
  const subGamesWithTournaments = await Promise.all(
    subGamesList.map(async (sg) => {
      const tournaments = await db
        .select({ tournamentId: subGameTournaments.tournamentId })
        .from(subGameTournaments)
        .where(eq(subGameTournaments.subGameId, sg.id));
      return {
        ...sg,
        tournamentIds: tournaments.map((t) => t.tournamentId),
      };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Game Settings</h1>
        <p className="text-sm text-neutral-500">{game.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Game Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-neutral-500">Invite Code: </span>
            <span className="font-mono font-bold">{game.inviteCode}</span>
          </div>
          <div>
            <span className="text-neutral-500">Season: </span>
            <span>{game.seasonYear}</span>
          </div>
        </CardContent>
      </Card>

      <SettingsClient
        gameId={gameId}
        gameName={game.name}
        subGames={subGamesWithTournaments}
        tournaments={seasonTournaments.map((t) => ({
          id: t.id,
          name: t.name,
          startDate: t.startDate.toISOString(),
        }))}
      />
    </div>
  );
}
