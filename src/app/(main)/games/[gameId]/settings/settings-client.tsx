"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createSubGame,
  updateSubGame,
  deleteSubGame,
} from "@/lib/actions/sub-games";
import { updateGameName, syncEarnings } from "@/lib/actions/games";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Save, Pencil } from "lucide-react";

interface SubGame {
  id: number;
  name: string;
  description: string | null;
  tournamentIds: number[];
}

interface Tournament {
  id: number;
  name: string;
  startDate: string;
}

interface SettingsClientProps {
  gameId: number;
  gameName: string;
  subGames: SubGame[];
  tournaments: Tournament[];
  memberEmails: string[];
}

export function SettingsClient({
  gameId,
  gameName,
  subGames: initialSubGames,
  tournaments,
  memberEmails,
}: SettingsClientProps) {
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(gameName);
  const [savingName, setSavingName] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTournamentIds, setNewTournamentIds] = useState<number[]>([]);
  const [gmailAccountIndex, setGmailAccountIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncingEarnings, setSyncingEarnings] = useState(false);

  async function handleSaveName() {
    if (!nameValue.trim() || nameValue.trim() === gameName) {
      setEditingName(false);
      setNameValue(gameName);
      return;
    }
    setSavingName(true);
    try {
      await updateGameName(gameId, nameValue.trim());
      toast.success("League name updated!");
      setEditingName(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update name"
      );
    } finally {
      setSavingName(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await createSubGame(gameId, newName.trim(), newDescription || null, newTournamentIds);
      toast.success("Sub-game created!");
      setNewName("");
      setNewDescription("");
      setNewTournamentIds([]);
      setShowCreate(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create sub-game"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(subGameId: number) {
    if (!confirm("Delete this sub-game?")) return;
    try {
      await deleteSubGame(gameId, subGameId);
      toast.success("Sub-game deleted");
      router.refresh();
    } catch (error) {
      toast.error("Failed to delete sub-game");
    }
  }

  function toggleTournament(tournamentId: number) {
    setNewTournamentIds((prev) =>
      prev.includes(tournamentId)
        ? prev.filter((id) => id !== tournamentId)
        : [...prev, tournamentId]
    );
  }

  async function handleSyncEarnings() {
    setSyncingEarnings(true);
    try {
      const result = await syncEarnings(gameId);
      if (result.success) {
        toast.success("Earnings synced! Leaderboard updated.");
        router.refresh();
      } else {
        const msg = "error" in result ? result.error : "Sync failed";
        toast.error(msg ?? "Sync failed");
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncingEarnings(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* League Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">League Name</CardTitle>
        </CardHeader>
        <CardContent>
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNameValue(gameName);
                  }
                }}
                autoFocus
                className="max-w-xs"
              />
              <Button
                size="sm"
                onClick={handleSaveName}
                disabled={savingName}
                className="bg-green-600 hover:bg-green-700"
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {savingName ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingName(false);
                  setNameValue(gameName);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-medium">{gameName}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingName(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sub-Games</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New Sub-Game
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Sub-Game</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <Input
                placeholder="e.g., Majors, Fall Swing, Q1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Description (optional)
              </label>
              <Input
                placeholder="Brief description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">
                Select Tournaments
              </label>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
                {tournaments.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={newTournamentIds.includes(t.id)}
                      onChange={() => toggleTournament(t.id)}
                      className="rounded"
                    />
                    <span className="text-sm">{t.name}</span>
                    <span className="text-xs text-neutral-400">
                      {new Date(t.startDate).toLocaleDateString()}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {newTournamentIds.length} tournaments selected
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={loading || !newName.trim()}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? "Creating..." : "Create Sub-Game"}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commissioner Tools */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commissioner Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-2 text-sm text-neutral-600">
              Manually sync earnings from the SportsData API. Use this if the
              leaderboard shows $0 after a tournament ends — the API sometimes
              delays final payout data by several days.
            </p>
            <Button
              onClick={handleSyncEarnings}
              disabled={syncingEarnings}
              variant="outline"
              size="sm"
            >
              {syncingEarnings ? "Syncing..." : "Sync Earnings Now"}
            </Button>
          </div>

          {memberEmails.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Member Emails</p>
              <p className="mb-3 text-sm text-neutral-600">
                {memberEmails.length} member
                {memberEmails.length !== 1 ? "s" : ""} with email addresses.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(memberEmails.join(", "))
                      .then(() => toast.success("Emails copied to clipboard!"))
                      .catch(() => toast.error("Failed to copy"));
                  }}
                >
                  Copy to Clipboard
                </Button>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const bcc = memberEmails.join(",");
                      window.open(
                        `https://mail.google.com/mail/u/${gmailAccountIndex}/?view=cm&bcc=${encodeURIComponent(bcc)}`,
                        "_blank"
                      );
                    }}
                  >
                    Open in Gmail
                  </Button>
                  <select
                    value={gmailAccountIndex}
                    onChange={(e) =>
                      setGmailAccountIndex(Number(e.target.value))
                    }
                    className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-600"
                    title="Gmail account"
                  >
                    <option value={0}>Account 1</option>
                    <option value={1}>Account 2</option>
                    <option value={2}>Account 3</option>
                    <option value={3}>Account 4</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {initialSubGames.length === 0 && !showCreate ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-neutral-500">
              No sub-games yet. Create one to group tournaments for
              mini-leaderboards.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {initialSubGames.map((sg) => (
            <Card key={sg.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{sg.name}</p>
                  {sg.description && (
                    <p className="text-sm text-neutral-500">
                      {sg.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-neutral-400">
                    {sg.tournamentIds.length} tournaments
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(sg.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
