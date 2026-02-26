import { auth } from "@/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getGameById, getUserRole, getGameMembers } from "@/lib/queries/games";
import { getCustomLeaderboards } from "@/lib/actions/custom-leaderboards";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { CustomLeaderboardsClient } from "./custom-leaderboards-client";

export default async function CustomLeaderboardsPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId: gidStr } = await params;
  const gameId = parseInt(gidStr);
  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session.user.id;

  const [game, role, members, customLbs] = await Promise.all([
    getGameById(gameId),
    getUserRole(gameId, userId),
    getGameMembers(gameId),
    getCustomLeaderboards(gameId),
  ]);
  if (!game || !role) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/games/${gameId}/leaderboard`}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Custom Leaderboards</h1>
          <p className="text-sm text-neutral-500">{game.name}</p>
        </div>
      </div>

      <CustomLeaderboardsClient
        gameId={gameId}
        currentUserId={userId}
        members={members.map((m) => ({
          userId: m.userId,
          displayName: m.userDisplayName ?? m.userName ?? "Member",
          email: m.userEmail ?? "",
        }))}
        initialLeaderboards={customLbs}
      />
    </div>
  );
}
