"use client";

import { useState } from "react";
import { addMemberByEmail } from "@/lib/actions/games";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

export function AddMemberForm({ gameId }: { gameId: number }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const result = await addMemberByEmail(gameId, email.trim());
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success(
          `${result.name || email.trim()} has been added and notified by email.`
        );
        setEmail("");
      }
    } catch {
      toast.error("Failed to add member. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <UserPlus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          type="email"
          placeholder="Enter email address..."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="pl-9"
          required
        />
      </div>
      <Button
        type="submit"
        disabled={loading || !email.trim()}
        className="bg-green-600 hover:bg-green-700"
      >
        {loading ? "Adding..." : "Add"}
      </Button>
    </form>
  );
}
