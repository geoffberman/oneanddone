"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { KeyRound, Pencil, UserMinus } from "lucide-react";
import { removeMember, sendMemberPasswordReset, setMemberDisplayName, setMemberPassword } from "@/lib/actions/games";

interface Member {
  id: number;
  userId: string;
  userName: string | null;
  userDisplayName: string | null;
  userImage: string | null;
  role: "manager" | "player";
}

interface MemberListProps {
  gameId: number;
  members: Member[];
  currentUserId: string;
  isManager: boolean;
}

export function MemberList({
  gameId,
  members,
  currentUserId,
  isManager,
}: MemberListProps) {
  const router = useRouter();
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [resetTarget, setResetTarget] = useState<Member | null>(null);
  const [nameTarget, setNameTarget] = useState<Member | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    if (!removeTarget) return;
    setLoading(true);
    try {
      const result = await removeMember(gameId, removeTarget.userId);
      if (result.success) {
        toast.success(`${displayName(removeTarget)} has been removed`);
        setRemoveTarget(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to remove member. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    setLoading(true);
    try {
      const result = await sendMemberPasswordReset(gameId, resetTarget.userId);
      if (result.success) {
        toast.success("Password reset email sent");
        setResetTarget(null);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword() {
    if (!resetTarget) return;
    setLoading(true);
    try {
      const result = await setMemberPassword(gameId, resetTarget.userId, newPassword);
      if (result.success) {
        toast.success(`Password updated for ${displayName(resetTarget)}`);
        setResetTarget(null);
        setNewPassword("");
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to set password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetDisplayName() {
    if (!nameTarget) return;
    setLoading(true);
    try {
      const result = await setMemberDisplayName(gameId, nameTarget.userId, editName);
      if (result.success) {
        toast.success(`Display name updated for ${displayName(nameTarget)}`);
        setNameTarget(null);
        setEditName("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to update display name. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const displayName = (member: Member) =>
    member.userDisplayName ?? member.userName ?? "Member";

  const canManage = (member: Member) =>
    isManager && member.role !== "manager" && member.userId !== currentUserId;

  return (
    <>
      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2.5"
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={member.userImage || undefined} />
                <AvatarFallback className="text-xs">
                  {displayName(member).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">
                {displayName(member)}
                {member.userId === currentUserId && (
                  <span className="ml-1 text-xs text-neutral-400">(you)</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {canManage(member) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setNameTarget(member);
                      setEditName(member.userDisplayName ?? "");
                    }}
                    className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600"
                    title="Set display name"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetTarget(member)}
                    className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600"
                    title="Reset password"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(member)}
                    className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-red-100 hover:text-red-600"
                    title="Remove member"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                </>
              )}
              <Badge
                variant={member.role === "manager" ? "default" : "secondary"}
              >
                {member.role}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      {/* Remove Member Dialog */}
      <Dialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Remove {removeTarget ? displayName(removeTarget) : "this member"} from the game?
              This will delete all their picks and golfer usage history for this
              game. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveTarget(null)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={loading}
            >
              {loading ? "Removing..." : "Remove Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Password Dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Manage Password — {resetTarget ? displayName(resetTarget) : "Member"}
            </DialogTitle>
          </DialogHeader>

          {/* Set password directly */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Set password directly</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New password..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewPassword("oneanddone")}
                className="shrink-0 text-xs"
              >
                Use default
              </Button>
            </div>
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={handleSetPassword}
              disabled={loading || newPassword.length < 8}
            >
              {loading ? "Saving..." : "Set Password"}
            </Button>
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-red-500">
                Password must be at least 8 characters
              </p>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Send reset email */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Send a reset link by email</p>
            <p className="text-xs text-neutral-500">
              {resetTarget ? displayName(resetTarget) : "The member"} will receive an email
              with a link to set their own password.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResetPassword}
              disabled={loading}
            >
              {loading ? "Sending..." : "Send Reset Email"}
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setResetTarget(null);
                setNewPassword("");
              }}
              disabled={loading}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Display Name Dialog */}
      <Dialog
        open={!!nameTarget}
        onOpenChange={(open) => {
          if (!open) {
            setNameTarget(null);
            setEditName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Set Display Name — {nameTarget ? displayName(nameTarget) : "Member"}
            </DialogTitle>
            <DialogDescription>
              This name will appear on the leaderboard and member list.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <input
              type="text"
              placeholder="Display name..."
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              className="w-full"
              onClick={handleSetDisplayName}
              disabled={loading || editName.trim().length === 0}
            >
              {loading ? "Saving..." : "Save Name"}
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setNameTarget(null);
                setEditName("");
              }}
              disabled={loading}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
