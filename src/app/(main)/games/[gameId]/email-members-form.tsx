"use client";

import { useState } from "react";
import { emailMembers } from "@/lib/actions/announcements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function EmailMembersForm({ gameId }: { gameId: number }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    setLoading(true);
    try {
      const result = await emailMembers(gameId, subject, message);
      setSubject("");
      setMessage("");
      toast.success(`Email sent to ${result.sent} member${result.sent !== 1 ? "s" : ""}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send email"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Input
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <textarea
        placeholder="Write your message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />
      <Button
        type="submit"
        disabled={loading || !subject.trim() || !message.trim()}
        size="sm"
        className="bg-green-600 hover:bg-green-700"
      >
        {loading ? "Sending..." : "Send Email"}
      </Button>
    </form>
  );
}
