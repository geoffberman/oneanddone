import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getGameById, getUserRole } from "@/lib/queries/games";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserCog } from "lucide-react";
import { SettingsForm } from "./settings-form";

export default async function UserSettingsPage({
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

  const [user] = await db
    .select({ name: users.name, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-neutral-500">{game.name}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-neutral-600" />
            <CardTitle>Profile</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <SettingsForm
            currentName={user?.name || ""}
            currentDisplayName={user?.displayName || user?.name || ""}
          />
        </CardContent>
      </Card>
    </div>
  );
}
