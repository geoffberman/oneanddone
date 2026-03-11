"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Check, Clock, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { updateGameName } from "@/lib/actions/games";
import { TournamentInfoButton } from "@/components/tournament-info-button";

interface GameTileProps {
  gameId: number;
  gameName: string;
  isManager: boolean;
  currentTournamentName?: string | null;
  pickDeadline?: string | null;   // pre-formatted string
  pickPrimaryName?: string | null;
  pickAlternateName?: string | null;
}

export function GameTile({
  gameId,
  gameName,
  isManager,
  currentTournamentName,
  pickDeadline,
  pickPrimaryName,
  pickAlternateName,
}: GameTileProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(gameName);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === gameName) {
      setEditing(false);
      setNameValue(gameName);
      return;
    }
    setSaving(true);
    try {
      await updateGameName(gameId, trimmed);
      toast.success("League name updated!");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setNameValue(gameName);
  }

  const cardClass = `transition-shadow hover:shadow-md ${
    isManager ? "border-amber-200 bg-amber-50 ring-1 ring-amber-100" : ""
  }`;

  const cardBody = (
    <Card className={cardClass}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          {editing ? (
            /* inline edit row — fills header */
            <div
              className="flex flex-1 items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
                autoFocus
                className="h-8 text-base font-semibold"
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 bg-green-600 hover:bg-green-700"
                onClick={handleSave}
                disabled={saving}
                title="Save"
              >
                <Save className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={handleCancel}
                disabled={saving}
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <CardTitle className="text-lg leading-tight">{gameName}</CardTitle>
              <div className="flex shrink-0 items-center gap-1.5">
                {isManager && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditing(true);
                    }}
                    className="rounded p-1 text-amber-400 transition-colors hover:bg-amber-100 hover:text-amber-600"
                    title="Rename league"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {isManager && (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                    Manager
                  </Badge>
                )}
              </div>
            </>
          )}
        </div>
      </CardHeader>

      {currentTournamentName && (
        <CardContent className="space-y-1.5 text-sm text-neutral-600">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-green-600" />
            <span>{currentTournamentName}</span>
            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
              <TournamentInfoButton tournamentName={currentTournamentName} />
            </div>
          </div>
          {pickDeadline && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              <span>Picks lock {pickDeadline}</span>
            </div>
          )}
          <div className="flex items-start gap-1.5 pt-1">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
            {pickPrimaryName ? (
              <span>
                Your pick: {pickPrimaryName}
                {pickAlternateName && (
                  <span className="text-neutral-400">
                    {" "}(Alt: {pickAlternateName})
                  </span>
                )}
              </span>
            ) : (
              <span className="text-neutral-400">No pick entered yet</span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );

  // When editing, don't wrap in a Link (clicking shouldn't navigate)
  if (editing) {
    return <div>{cardBody}</div>;
  }

  return (
    <Link href={`/games/${gameId}`}>
      {cardBody}
    </Link>
  );
}
