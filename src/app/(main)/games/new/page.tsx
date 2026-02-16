"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGame } from "@/lib/actions/games";
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

export default function CreateGamePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const game = await createGame(name.trim());
      toast.success("Game created successfully!");
      router.push(`/games/${game.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create game"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Create a New Game</CardTitle>
          <CardDescription>
            Start a One and Done game and invite your friends.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-sm font-medium"
              >
                Game Name
              </label>
              <Input
                id="name"
                placeholder="e.g., Office Golf Pool 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {loading ? "Creating..." : "Create Game"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
