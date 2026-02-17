"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGameRules } from "@/lib/actions/games";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function RulesEditor({
  gameId,
  initialRules,
}: {
  gameId: number;
  initialRules: string;
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleSave() {
    setLoading(true);
    try {
      await updateGameRules(gameId, rules);
      toast.success("Rules updated");
      setEditing(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update rules"
      );
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit Rules
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={rules}
        onChange={(e) => setRules(e.target.value)}
        rows={12}
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        placeholder="Enter pool rules..."
      />
      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={loading}
          size="sm"
          className="bg-green-600 hover:bg-green-700"
        >
          {loading ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRules(initialRules);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
