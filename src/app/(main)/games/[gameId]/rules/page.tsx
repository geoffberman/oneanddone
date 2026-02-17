import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getGameById, getUserRole } from "@/lib/queries/games";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollText } from "lucide-react";
import { RulesEditor } from "./rules-editor";

export default async function PoolRulesPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId: gidStr } = await params;
  const gameId = parseInt(gidStr);
  const session = await auth();
  if (!session?.user?.id) notFound();

  const [game, role] = await Promise.all([
    getGameById(gameId),
    getUserRole(gameId, session.user.id),
  ]);
  if (!game || !role) notFound();

  const isManager = role === "manager";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pool Rules</h1>
        <p className="text-sm text-neutral-500">{game.name}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-blue-600" />
              <CardTitle>Rules</CardTitle>
            </div>
            {isManager && (
              <RulesEditor gameId={gameId} initialRules={game.rules || ""} />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {game.rules ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
              {game.rules}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-neutral-500">
              {isManager
                ? "No rules set yet. Click \"Edit Rules\" above to add them."
                : "No rules have been set for this league yet."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
