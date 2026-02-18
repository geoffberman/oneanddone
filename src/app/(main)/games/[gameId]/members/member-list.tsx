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
import { KeyRound, UserMinus } from "lucide-react";
import { removeMember, sendMemberPasswordReset } from "@/lib/actions/games";

interface Member {
  id: number;
  userId: string;
  userName: string | null;
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
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    if (!removeTarget) return;
    setLoading(true);
    try {
      const result = await removeMember(gameId, removeTarget.userId);
      if (result.success) {
        toast.success(`${removeTarget.userName || "Member"} has been removed`);
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
                  {member.userName?.charAt(0)?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">
                {member.userName}
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
              Remove {removeTarget?.userName || "this member"} from the game?
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

      {/* Reset Password Dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Send a password reset email to{" "}
              {resetTarget?.userName || "this member"}? They will receive an
              email with a link to set a new password.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetTarget(null)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? "Sending..." : "Send Reset Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
