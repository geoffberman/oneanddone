"use client";

import { useState } from "react";
import { sendAnnouncement } from "@/lib/actions/announcements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function AnnouncementForm({ gameId }: { gameId: number }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    try {
      await sendAnnouncement(gameId, message);
      setMessage("");
      toast.success("Announcement sent");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send announcement"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        placeholder="Message all members..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="flex-1"
      />
      <Button
        type="submit"
        disabled={loading || !message.trim()}
        size="sm"
        className="bg-green-600 hover:bg-green-700"
      >
        {loading ? "Sending..." : "Send"}
      </Button>
    </form>
  );
}
