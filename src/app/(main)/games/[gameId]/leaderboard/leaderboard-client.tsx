"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/utils";
import { Trophy, Check, X } from "lucide-react";

interface LeaderboardEntry {
  userId: string;
  userName: string | null;
  userImage: string | null;
  totalEarnings: string;
  pickCount: number;
  rank: number;
  hasCurrentPick?: boolean;
  currentPickName?: string | null;
  currentPickIsAlternate?: boolean;
  livePosition?: number | null;
  liveIsTied?: boolean;
  liveTiedCount?: number;
  liveTotalScoreToPar?: number | null;
  liveMadeCut?: boolean | null;
  liveIsWithdrawn?: boolean | null;
  liveRounds?: number | null;
}

interface BoardOption {
  id: string;
  label: string;
  type: "season" | "weekly" | "sub";
  entries: LeaderboardEntry[];
}

interface Props {
  options: BoardOption[];
  currentUserId: string;
  defaultBoard?: string;
  isLocked: boolean;
  isInProgress: boolean;
}

function formatScoreToPar(score: number | null | undefined): string {
  if (score == null) return "";
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function formatLiveScore(entry: LeaderboardEntry): string | null {
  if (entry.liveIsWithdrawn) return "WD";

  const prefix = entry.liveIsTied ? "T" : "";

  // Show position + tournament total score to par
  if (entry.livePosition != null && entry.livePosition > 0) {
    const score = formatScoreToPar(entry.liveTotalScoreToPar);
    return score
      ? `${prefix}${entry.livePosition} · ${score}`
      : `${prefix}${entry.livePosition}`;
  }

  // No active position — player missed the cut; show score if available
  if (entry.liveMadeCut === false) {
    const score = formatScoreToPar(entry.liveTotalScoreToPar);
    return score ? `MC · ${score}` : "MC";
  }

  // Early in tournament (no position yet), show score alone if available
  if (entry.liveTotalScoreToPar != null) {
    return formatScoreToPar(entry.liveTotalScoreToPar);
  }

  return null;
}

function liveScoreColor(entry: LeaderboardEntry): string {
  if (entry.liveIsWithdrawn || entry.liveMadeCut === false) return "text-neutral-400";
  const score = entry.liveTotalScoreToPar;
  if (score == null) return "text-neutral-500";
  if (score < 0) return "text-green-700";
  if (score > 0) return "text-red-600";
  return "text-neutral-600";
}

function PickStatusIndicator({ hasPick }: { hasPick: boolean }) {
  if (hasPick) {
    return <Check className="h-3.5 w-3.5 text-green-600" />;
  }
  return <X className="h-3.5 w-3.5 text-red-500" />;
}

export function LeaderboardClient({
  options,
  currentUserId,
  defaultBoard,
  isLocked,
  isInProgress,
}: Props) {
  const [selected, setSelected] = useState(defaultBoard || options[0]?.id || "");

  const current = options.find((o) => o.id === selected);
  const entries = current?.entries || [];
  const isWeeklyBoard = current?.type === "weekly";

  return (
    <div className="space-y-4">
      <div>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-green-600" />
            <CardTitle>Standings</CardTitle>
            {isInProgress && (
              <span className="ml-auto flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              No picks have been made yet.
            </p>
          ) : (
            <div className="space-y-1">
              {entries.map((entry) => {
                const isCurrentUser = entry.userId === currentUserId;
                const liveScore = isLocked ? formatLiveScore(entry) : null;
                const showWeeklyDetails = isWeeklyBoard && isLocked;
                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center justify-between rounded-lg px-3 py-3 ${
                      isCurrentUser
                        ? "bg-green-50 ring-1 ring-green-200"
                        : "bg-neutral-50"
                    }`}
                  >
                    {/* Left: rank, avatar, name, golfer */}
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-8 shrink-0 text-center text-lg font-bold ${
                          entry.rank <= 3
                            ? "text-green-600"
                            : "text-neutral-400"
                        }`}
                      >
                        {entry.rank}
                      </span>
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={entry.userImage || undefined} />
                        <AvatarFallback className="text-xs">
                          {entry.userName?.charAt(0)?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {entry.userName}
                          {isCurrentUser && (
                            <span className="ml-1 text-xs text-green-600">
                              (you)
                            </span>
                          )}
                        </p>
                        {isLocked && entry.currentPickName ? (
                          <p className="text-xs text-neutral-500 truncate">
                            {entry.currentPickName}
                            {entry.currentPickIsAlternate && (
                              <span className="ml-1 text-neutral-400">(alt)</span>
                            )}
                            {/* On non-weekly boards, show score inline with golfer name */}
                            {!isWeeklyBoard && liveScore && (
                              <span className={`ml-1.5 font-semibold ${liveScoreColor(entry)}`}>
                                · {liveScore}
                              </span>
                            )}
                          </p>
                        ) : isWeeklyBoard ? (
                          <p className="text-xs text-neutral-500 flex items-center gap-1">
                            <PickStatusIndicator hasPick={entry.hasCurrentPick ?? false} />
                            <span>{entry.hasCurrentPick ? "Picked" : "No pick"}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* Right: for weekly board show score + earnings stacked; otherwise just earnings */}
                    {showWeeklyDetails ? (
                      <div className="text-right shrink-0 ml-3">
                        {liveScore ? (
                          <p className={`text-sm font-semibold ${liveScoreColor(entry)}`}>
                            {liveScore}
                          </p>
                        ) : (
                          <p className="text-sm text-neutral-400">&mdash;</p>
                        )}
                        <p className="text-sm font-bold text-green-700">
                          {formatCurrency(entry.totalEarnings)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-base font-bold text-green-700 shrink-0 ml-3">
                        {formatCurrency(entry.totalEarnings)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
