import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getGameById, getGameMembers, getUserRole } from "@/lib/queries/games";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, UserPlus } from "lucide-react";
import { CopyInviteButton } from "./copy-invite-button";
import { AddMemberForm } from "./add-member-form";
import { MemberList } from "./member-list";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId: gidStr } = await params;
  const gameId = parseInt(gidStr);
  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session!.user!.id;

  const [game, role, members] = await Promise.all([
    getGameById(gameId),
    getUserRole(gameId, userId),
    getGameMembers(gameId),
  ]);
  if (!game || !role) notFound();

  const isManager = role === "manager";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Members</h1>
        <p className="text-sm text-neutral-500">
          {game.name} &middot; {members.length} members
        </p>
      </div>

      {isManager && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-neutral-500" />
              <CardTitle className="text-base">Add Member</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <AddMemberForm gameId={gameId} />
            <p className="mt-2 text-xs text-neutral-500">
              Add anyone by email. New users will get an invite to set up their account.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-neutral-500" />
              <CardTitle className="text-base">Invite Code</CardTitle>
            </div>
            <CopyInviteButton inviteCode={game.inviteCode} />
          </div>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-lg font-bold tracking-widest">
            {game.inviteCode}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Share this code with friends so they can join your game.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Players ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MemberList
            gameId={gameId}
            members={members.map((m) => ({
              id: m.id,
              userId: m.userId,
              userName: m.userName,
              userImage: m.userImage,
              role: m.role,
            }))}
            currentUserId={userId}
            isManager={isManager}
          />
        </CardContent>
      </Card>
    </div>
  );
}
