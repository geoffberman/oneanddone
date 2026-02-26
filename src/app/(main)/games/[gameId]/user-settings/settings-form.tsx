"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUserProfile } from "@/lib/actions/games";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function SettingsForm({
  currentName,
  currentDisplayName,
}: {
  currentName: string;
  currentDisplayName: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;

    setLoading(true);
    try {
      await updateUserProfile(displayName);
      toast.success("Settings saved");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save settings"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="accountName"
          className="mb-1.5 block text-sm font-medium"
        >
          Account Name
        </label>
        <Input
          id="accountName"
          value={currentName}
          disabled
          className="bg-neutral-50 text-neutral-500"
        />
        <p className="mt-1 text-xs text-neutral-400">
          Set during registration and cannot be changed.
        </p>
      </div>
      <div>
        <label
          htmlFor="displayName"
          className="mb-1.5 block text-sm font-medium"
        >
          Team Name
        </label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your team name on leaderboards"
        />
        <p className="mt-1 text-xs text-neutral-400">
          Your team name is shown on leaderboards and pick history.
        </p>
      </div>
      <Button
        type="submit"
        disabled={loading || !displayName.trim()}
        className="bg-green-600 hover:bg-green-700"
      >
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
