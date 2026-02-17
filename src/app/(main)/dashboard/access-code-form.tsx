"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinGame } from "@/lib/actions/games";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function AccessCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    try {
      await joinGame(code.trim());
      toast.success("Joined league successfully!");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Invalid access code"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        placeholder="Enter access code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={8}
        required
        className="max-w-48 font-mono tracking-widest uppercase"
      />
      <Button
        type="submit"
        disabled={loading || !code.trim()}
        className="bg-green-600 hover:bg-green-700"
      >
        {loading ? "Joining..." : "Join"}
      </Button>
    </form>
  );
}
