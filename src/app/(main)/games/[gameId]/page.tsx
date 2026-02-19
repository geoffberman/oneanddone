import Link from "next/link";
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getGameById, getUserRole } from "@/lib/queries/games";
import { getCurrentTournament } from "@/lib/queries/tournaments";
import { getUserPickWithNames } from "@/lib/actions/picks";
import { getAnnouncements } from "@/lib/actions/announcements";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDeadline } from "@/lib/utils";
import {
  Trophy,
  Calendar,
  Clock,
  ScrollText,
  UserCog,
  Settings,
  Megaphone,
  Mail,
  Users,
  ChevronRight,
} from "lucide-react";
import { AnnouncementForm } from "./announcement-form";
import { EmailMembersForm } from "./email-members-form";

export default async function GameHomePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId: gameIdStr } = await params;
  const gameId = parseInt(gameIdStr);
  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session!.user!.id;

  const [game, role, currentTournament, recentAnnouncements] =
    await Promise.all([
      getGameById(gameId),
      getUserRole(gameId, userId),
      getCurrentTournament(),
      getAnnouncements(gameId, 3).catch(() => []),
    ]);

  if (!game || !role) notFound();

  const currentPick = currentTournament
    ? await getUserPickWithNames(gameId, currentTournament.id)
    : null;

  const isManager = role === "manager";
  const pickDeadline = currentTournament
    ? currentTournament.firstTeeTime || currentTournament.startDate
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{game.name}</h1>
          <p className="text-sm text-neutral-500">
            {game.seasonYear} Season
          </p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/games/${gameId}/members`}>
                <Users className="mr-1.5 h-4 w-4" />
                Members
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/games/${gameId}/settings`}>
                <Settings className="mr-1.5 h-4 w-4" />
                Manage
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* This Week's Pick */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-600" />
              <CardTitle className="text-base">
                {currentTournament
                  ? currentTournament.name
                  : "No upcoming tournament"}
              </CardTitle>
            </div>
            {currentTournament && (
              <Badge
                variant={
                  currentTournament.isInProgress ? "default" : "outline"
                }
              >
                {currentTournament.isInProgress ? "In Progress" : "Upcoming"}
              </Badge>
            )}
          </div>
        </CardHeader>
        {currentTournament && (
          <CardContent className="space-y-3">
            {pickDeadline && (
              <div className="flex items-center gap-1.5 text-sm text-neutral-500">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                <span>Picks deadline {formatDeadline(pickDeadline)}</span>
              </div>
            )}
            {currentPick ? (
              <div className="rounded-lg bg-green-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-green-800">
                    Pick submitted
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/games/${gameId}/picks/${currentTournament.id}`}
                    >
                      View / Change
                    </Link>
                  </Button>
                </div>
                <div className="mt-2 space-y-0.5 text-sm text-green-700">
                  <p>{currentPick.primaryName}</p>
                  {currentPick.alternateName && (
                    <p className="text-green-600">
                      Alt: {currentPick.alternateName}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <Button
                asChild
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Link
                  href={`/games/${gameId}/picks/${currentTournament.id}`}
                >
                  Make Your Pick
                </Link>
              </Button>
            )}
          </CardContent>
        )}
      </Card>

      {/* Navigation */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`/games/${gameId}/leaderboard`}>
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <Trophy className="h-5 w-5 text-green-600" />
                <span className="font-medium">Leaderboard</span>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </CardContent>
          </Card>
        </Link>
        <Link href={`/games/${gameId}/rules`}>
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <ScrollText className="h-5 w-5 text-blue-600" />
                <span className="font-medium">Pool Rules</span>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </CardContent>
          </Card>
        </Link>
        <Link href={`/games/${gameId}/user-settings`}>
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <UserCog className="h-5 w-5 text-neutral-600" />
                <span className="font-medium">Settings</span>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Manager: Send Announcement + Email Members */}
      {isManager && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-neutral-500" />
                <CardTitle className="text-base">Post Announcement</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <AnnouncementForm gameId={gameId} />
              <p className="mt-2 text-xs text-neutral-500">
                Visible to all members on this page.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-neutral-500" />
                <CardTitle className="text-base">Email Members</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <EmailMembersForm gameId={gameId} />
              <p className="mt-2 text-xs text-neutral-500">
                Sends an email directly to every member of this league.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* Recent Announcements */}
      {recentAnnouncements.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Announcements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAnnouncements.map((a) => (
              <div
                key={a.id}
                className="rounded-lg bg-neutral-50 px-4 py-3"
              >
                <p className="text-sm">{a.message}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {a.authorName} &middot; {formatDate(a.createdAt)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
