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
import { Trophy } from "lucide-react";

interface LeaderboardEntry {
  userId: string;
  userName: string | null;
  userImage: string | null;
  totalEarnings: string;
  pickCount: number;
  rank: number;
  currentPickName?: string | null;
  currentPickIsAlternate?: boolean;
}

interface BoardOption {
  id: string;
  label: string;
  entries: LeaderboardEntry[];
}

interface Props {
  options: BoardOption[];
  currentUserId: string;
  defaultBoard?: string;
  isLocked: boolean;
}

export function LeaderboardClient({
  options,
  currentUserId,
  defaultBoard,
  isLocked,
}: Props) {
  const [selected, setSelected] = useState(defaultBoard || options[0]?.id || "");

  const current = options.find((o) => o.id === selected);
  const entries = current?.entries || [];

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
                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center justify-between rounded-lg px-3 py-3 ${
                      isCurrentUser
                        ? "bg-green-50 ring-1 ring-green-200"
                        : "bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 text-center text-lg font-bold ${
                          entry.rank <= 3
                            ? "text-green-600"
                            : "text-neutral-400"
                        }`}
                      >
                        {entry.rank}
                      </span>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={entry.userImage || undefined} />
                        <AvatarFallback className="text-xs">
                          {entry.userName?.charAt(0)?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {entry.userName}
                          {isCurrentUser && (
                            <span className="ml-1 text-xs text-green-600">
                              (you)
                            </span>
                          )}
                        </p>
                        {isLocked && entry.currentPickName ? (
                          <p className="text-xs text-green-700 font-medium">
                            {entry.currentPickName}
                            {entry.currentPickIsAlternate && (
                              <span className="ml-1 font-normal text-neutral-400">(alt)</span>
                            )}
                          </p>
                        ) : (
                          <p className="text-xs text-neutral-500">
                            {entry.pickCount} pick{entry.pickCount !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-base font-bold text-green-700">
                      {formatCurrency(entry.totalEarnings)}
                    </span>
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
