import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getGameById, getUserRole } from "@/lib/queries/games";
import { getPickHistory } from "@/lib/queries/leaderboard";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PickHistoryPage({
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
  if (!game || !role) notFound();

  const history = await getPickHistory(gameId, userId);
  const totalEarnings = history.reduce(
    (sum, h) => sum + parseFloat(h.earnings),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pick History</h1>
        <p className="text-sm text-neutral-500">
          {game.name} &middot; Total Earnings:{" "}
          <span className="font-semibold text-green-700">
            {formatCurrency(totalEarnings)}
          </span>
        </p>
      </div>

      {history.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-neutral-500">
              No picks made yet this season.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {history.map((entry) => (
            <Card key={entry.pickId}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">
                    {entry.tournamentName}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatDate(entry.tournamentStartDate)}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm">
                      {entry.activeGolferName || entry.primaryGolferName}
                    </span>
                    {entry.alternateActivated && (
                      <Badge variant="warning" className="text-xs">
                        Alt activated
                      </Badge>
                    )}
                  </div>
                  {entry.alternateGolferName && (
                    <p className="mt-0.5 text-xs text-neutral-400">
                      Alternate: {entry.alternateGolferName}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span
                    className={`text-sm font-semibold ${
                      parseFloat(entry.earnings) > 0
                        ? "text-green-700"
                        : "text-neutral-400"
                    }`}
                  >
                    {formatCurrency(entry.earnings)}
                  </span>
                  {!entry.isOver && (
                    <p className="text-xs text-neutral-400">Pending</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
