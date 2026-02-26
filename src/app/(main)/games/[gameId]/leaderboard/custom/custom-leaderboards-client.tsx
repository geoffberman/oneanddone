"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Share2, Trash2, Trophy, X, ChevronRight } from "lucide-react";
import {
  createCustomLeaderboard,
  deleteCustomLeaderboard,
  shareCustomLeaderboard,
  removeShare,
  type CustomLeaderboardSummary,
} from "@/lib/actions/custom-leaderboards";

interface Member {
  userId: string;
  displayName: string;
  email: string;
}

interface Props {
  gameId: number;
  currentUserId: string;
  members: Member[];
  initialLeaderboards: CustomLeaderboardSummary[];
}

export function CustomLeaderboardsClient({
  gameId,
  currentUserId,
  members,
  initialLeaderboards,
}: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [creating, setCreating] = useState(false);

  // Share dialog
  const [shareTarget, setShareTarget] = useState<CustomLeaderboardSummary | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [sharing, setSharing] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<CustomLeaderboardSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  function toggleMember(userId: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function handleCreate() {
    if (!newName.trim() || selectedMemberIds.length === 0) return;
    setCreating(true);
    try {
      await createCustomLeaderboard(gameId, newName.trim(), selectedMemberIds);
      toast.success("Custom leaderboard created!");
      setNewName("");
      setSelectedMemberIds([]);
      setShowCreate(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomLeaderboard(deleteTarget.id);
      toast.success("Leaderboard deleted");
      setDeleteTarget(null);
      router.refresh();
    } catch (e) {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function handleShare() {
    if (!shareTarget || !shareEmail.trim()) return;
    setSharing(true);
    try {
      const result = await shareCustomLeaderboard(shareTarget.id, shareEmail.trim());
      if (result.success) {
        toast.success("Shared successfully!");
        setShareEmail("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSharing(false);
    }
  }

  async function handleRemoveShare(leaderboardId: number, userId: string) {
    try {
      await removeShare(leaderboardId, userId);
      toast.success("Share removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove share");
    }
  }

  const filteredMembers = memberSearch.trim()
    ? members.filter(
        (m) =>
          m.displayName.toLowerCase().includes(memberSearch.toLowerCase()) ||
          m.email.toLowerCase().includes(memberSearch.toLowerCase())
      )
    : members;

  return (
    <>
      {/* Create button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          Create a custom view with a subset of pool members — visible only to
          you, or share it with specific players.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Custom Leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <Input
                placeholder="e.g. Top Dogs, My Friends"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Select Members ({selectedMemberIds.length} selected)
              </label>
              <Input
                placeholder="Search members…"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="mb-2"
              />
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
                {filteredMembers.map((m) => (
                  <label
                    key={m.userId}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(m.userId)}
                      onChange={() => toggleMember(m.userId)}
                    />
                    <span className="text-sm">{m.displayName}</span>
                    {m.email && (
                      <span className="text-xs text-neutral-400">{m.email}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || selectedMemberIds.length === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                {creating ? "Creating…" : "Create"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreate(false);
                  setNewName("");
                  setSelectedMemberIds([]);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard list */}
      {initialLeaderboards.length === 0 && !showCreate ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="mb-3 h-10 w-10 text-neutral-300" />
            <p className="text-sm text-neutral-500">
              No custom leaderboards yet. Create one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {initialLeaderboards.map((lb) => (
            <Card key={lb.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/games/${gameId}/leaderboard/custom/${lb.id}`}
                      className="font-medium hover:underline"
                    >
                      {lb.name}
                    </Link>
                    {!lb.isOwner && (
                      <Badge variant="secondary" className="text-xs">
                        Shared with me
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400">
                    {lb.memberCount} member{lb.memberCount !== 1 ? "s" : ""}
                    {lb.shares.length > 0 &&
                      ` · Shared with ${lb.shares.map((s) => s.userName ?? s.userEmail).join(", ")}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {lb.isOwner && (
                    <>
                      <button
                        onClick={() => {
                          setShareTarget(lb);
                          setShareEmail("");
                        }}
                        className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                        title="Share"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(lb)}
                        className="rounded p-1.5 text-neutral-400 hover:bg-red-100 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <Link
                    href={`/games/${gameId}/leaderboard/custom/${lb.id}`}
                    className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Share dialog */}
      <Dialog open={!!shareTarget} onOpenChange={(open) => !open && setShareTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share &ldquo;{shareTarget?.name}&rdquo;</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-neutral-500">
              Enter the email address of a pool member to give them access.
            </p>
            <Input
              placeholder="their@email.com"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleShare()}
            />
            {/* Existing shares */}
            {shareTarget && shareTarget.shares.length > 0 && (
              <div className="rounded-lg border border-neutral-100 p-3">
                <p className="mb-2 text-xs font-medium text-neutral-500">
                  Currently shared with:
                </p>
                <div className="space-y-1">
                  {shareTarget.shares.map((s) => (
                    <div key={s.userId} className="flex items-center justify-between text-sm">
                      <span>{s.userName ?? s.userEmail}</span>
                      <button
                        onClick={() =>
                          handleRemoveShare(shareTarget.id, s.userId)
                        }
                        className="text-neutral-400 hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShareTarget(null)}>
              Close
            </Button>
            <Button
              onClick={handleShare}
              disabled={sharing || !shareEmail.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {sharing ? "Sharing…" : "Share"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-500">
            This will permanently delete the custom leaderboard. This action
            cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
