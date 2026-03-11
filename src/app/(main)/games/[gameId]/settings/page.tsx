import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getGameById, getUserRole, getGameMembers } from "@/lib/queries/games";
import { getSubGames } from "@/lib/actions/sub-games";
import { getSeasonTournaments, getLatestSeason } from "@/lib/queries/tournaments";
import { db } from "@/db";
import { subGameTournaments, tournaments } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
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

  const [subGamesList, seasonTournaments, members] = await Promise.all([
    getSubGames(gameId),
    getSeasonTournaments(game.seasonId),
    getGameMembers(gameId),
  ]);

  // Build a mapping from any tournament ID → the canonical ID shown in the
  // deduplicated seasonTournaments list. This handles the case where the DB
  // has two rows for the same tournament (e.g. "Arnold Palmer Invitational"
  // and "...presented by Mastercard") and picks may be under either ID.
  const normalizeForDedup = (name: string) =>
    name
      .replace(/\s+(presented|powered|sponsored)\s+by\s+.*/i, "")
      .trim()
      .toLowerCase();

  const canonicalIdByNorm = new Map<string, number>();
  for (const t of seasonTournaments) {
    canonicalIdByNorm.set(normalizeForDedup(t.name), t.id);
  }

  const allSeasonTourns = await db
    .select({ id: tournaments.id, name: tournaments.name })
    .from(tournaments)
    .where(eq(tournaments.seasonId, game.seasonId))
    .orderBy(asc(tournaments.startDate));

  const idToCanonical = new Map<number, number>();
  for (const t of allSeasonTourns) {
    const canonical = canonicalIdByNorm.get(normalizeForDedup(t.name));
    if (canonical != null) idToCanonical.set(t.id, canonical);
  }

  // Get tournament IDs for each sub-game, normalized to canonical IDs
  const subGamesWithTournaments = await Promise.all(
    subGamesList.map(async (sg) => {
      const sgTourns = await db
        .select({ tournamentId: subGameTournaments.tournamentId })
        .from(subGameTournaments)
        .where(eq(subGameTournaments.subGameId, sg.id));
      const rawIds = sgTourns.map((t) => t.tournamentId);
      // Map to canonical IDs so checkboxes match the deduplicated list
      const canonicalIds = [...new Set(rawIds.map((id) => idToCanonical.get(id) ?? id))];
      return { ...sg, tournamentIds: canonicalIds };
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
          purse: t.purse ?? null,
        }))}
        memberEmails={members
          .map((m) => m.userEmail)
          .filter((e): e is string => !!e)}
      />
    </div>
  );
}
