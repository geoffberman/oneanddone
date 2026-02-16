"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { joinGame } from "@/lib/actions/games";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

export default function JoinGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") || "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    try {
      const game = await joinGame(code.trim());
      toast.success("Joined game successfully!");
      router.push(`/games/${game.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to join game"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Join a Game</CardTitle>
          <CardDescription>
            Enter the invite code shared by the game manager.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="code"
                className="mb-1.5 block text-sm font-medium"
              >
                Invite Code
              </label>
              <Input
                id="code"
                placeholder="e.g., ABC12DEF"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                required
                className="text-center text-lg font-mono tracking-widest"
              />
            </div>
            <Button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {loading ? "Joining..." : "Join Game"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
