import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserRole } from "@/lib/queries/games";
import { getTournamentField } from "@/lib/queries/tournaments";
import { getUserPick } from "@/lib/actions/picks";
import { formatDate } from "@/lib/utils";
import { PickSelectionClient } from "./pick-selection-client";

export default async function PickSelectionPage({
  params,
}: {
  params: Promise<{ gameId: string; tournamentId: string }>;
}) {
  const { gameId: gidStr, tournamentId: tidStr } = await params;
  const gameId = parseInt(gidStr);
  const tournamentId = parseInt(tidStr);

  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session!.user!.id;

  const role = await getUserRole(gameId, userId);
  if (!role) notFound();

  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!tournament) notFound();

  const field = await getTournamentField(tournamentId, {
    gameId,
    userId,
  });

  const existingPick = await getUserPick(gameId, tournamentId);

  const lockTime = tournament.firstTeeTime || tournament.startDate;
  const isLocked = lockTime ? new Date() >= new Date(lockTime) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <div className="mt-1 flex flex-wrap gap-3 text-sm text-neutral-500">
          <span>{tournament.venue}</span>
          <span>{tournament.location}</span>
          <span>{formatDate(tournament.startDate)}</span>
        </div>
        {lockTime && !isLocked && (
          <p className="mt-2 text-sm text-amber-600">
            Picks lock at {formatDate(lockTime)}
          </p>
        )}
        {isLocked && (
          <p className="mt-2 text-sm font-medium text-red-600">
            Picks are locked for this tournament
          </p>
        )}
      </div>

      <PickSelectionClient
        gameId={gameId}
        tournamentId={tournamentId}
        field={field}
        existingPick={
          existingPick
            ? {
                primaryGolferId: existingPick.primaryGolferId,
                alternateGolferId: existingPick.alternateGolferId,
              }
            : null
        }
        isLocked={isLocked}
      />
    </div>
  );
}
