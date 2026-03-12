"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ExternalLink, Key, Send, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Claude brand color
const CLAUDE = "#cc785c";

function ClaudeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2.5a7.5 7.5 0 110 15 7.5 7.5 0 010-15zm-.75 3.5v2.25H9a.75.75 0 000 1.5h2.25V14a.75.75 0 001.5 0v-2.25H15a.75.75 0 000-1.5h-2.25V8a.75.75 0 00-1.5 0z"/>
    </svg>
  );
}

type Mode = "chat" | "link";
type Message = { role: "user" | "assistant"; content: string };

const API_KEY_STORAGE = "anthropic-api-key";

export function ResearchPanel({ tournamentName }: { tournamentName: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load saved key on mount
  useEffect(() => {
    const saved = localStorage.getItem(API_KEY_STORAGE) ?? "";
    setApiKey(saved);
    setKeyInput(saved);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function saveKey() {
    const trimmed = keyInput.trim();
    localStorage.setItem(API_KEY_STORAGE, trimmed);
    setApiKey(trimmed);
  }

  function clearKey() {
    localStorage.removeItem(API_KEY_STORAGE);
    setApiKey("");
    setKeyInput("");
    setMessages([]);
  }

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/golf/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ messages: [...messages, userMsg], tournamentName }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.ok
            ? data.response
            : `Error: ${data.error ?? "Failed to get response"}`,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error — please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, apiKey, messages, tournamentName]);

  return (
    <>
      {/* Claude-branded trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ backgroundColor: CLAUDE }}
        className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
      >
        <ClaudeIcon className="h-4 w-4" />
        Ask Claude
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[80vh] max-w-lg flex-col gap-0 p-0">
          {/* Claude-branded header */}
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClaudeIcon className="h-5 w-5" style={{ color: CLAUDE }} />
              Claude — {tournamentName}
            </DialogTitle>
          </DialogHeader>

          {/* Mode tabs */}
          <div className="flex gap-1 border-b px-5 pb-3">
            {(["chat", "link"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={mode === m ? { backgroundColor: CLAUDE } : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  mode === m
                    ? "text-white"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {m === "chat" ? "Chat here" : "Open Claude.ai"}
              </button>
            ))}
          </div>

          {/* Link mode */}
          {mode === "link" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <ClaudeIcon className="h-10 w-10" style={{ color: CLAUDE }} />
              <p className="text-sm text-neutral-500">
                Opens a new Claude.ai conversation in your browser. Requires an
                active Claude.ai subscription.
              </p>
              <a
                href="https://claude.ai/new"
                target="_blank"
                rel="noopener noreferrer"
                style={{ backgroundColor: CLAUDE }}
                className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
              >
                <ExternalLink className="h-4 w-4" />
                Open Claude.ai
              </a>
            </div>
          )}

          {/* Chat mode — no key */}
          {mode === "chat" && !apiKey && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
              <Key className="h-8 w-8" style={{ color: CLAUDE }} />
              <p className="text-center text-sm text-neutral-500">
                Enter your Anthropic API key to chat. It&apos;s stored only in
                your browser and never sent to our servers.
              </p>
              <div className="flex w-full gap-2">
                <input
                  type="password"
                  placeholder="sk-ant-..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveKey()}
                  className="flex-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": CLAUDE } as React.CSSProperties}
                />
                <button
                  onClick={saveKey}
                  disabled={!keyInput.trim()}
                  style={{ backgroundColor: CLAUDE }}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 transition hover:opacity-90"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-neutral-400">
                Get a key at{" "}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-neutral-600"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>
          )}

          {/* Chat mode — has key */}
          {mode === "chat" && apiKey && (
            <>
              <div className="flex items-center justify-between px-5 py-1.5 text-xs text-neutral-400">
                <span>API key saved in browser</span>
                <button
                  type="button"
                  onClick={clearKey}
                  className="flex items-center gap-1 rounded hover:text-neutral-600"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-3 px-5 py-2">
                {messages.length === 0 && (
                  <p className="py-10 text-center text-sm text-neutral-400">
                    Ask about players, course history, recent form…
                  </p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className="whitespace-pre-wrap rounded-lg px-3 py-2 text-sm"
                    style={
                      m.role === "user"
                        ? { backgroundColor: CLAUDE, color: "white", marginLeft: "2.5rem" }
                        : { backgroundColor: "#fdf5f2", color: "#1c1917", marginRight: "2.5rem" }
                    }
                  >
                    {m.content}
                  </div>
                ))}
                {loading && (
                  <div
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ backgroundColor: "#fdf5f2", color: CLAUDE, marginRight: "2.5rem" }}
                  >
                    Thinking…
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2 border-t px-5 py-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder="Ask about players, course history…"
                  className="flex-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#cc785c]"
                  disabled={loading}
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  style={{ backgroundColor: CLAUDE }}
                  className="rounded-md px-3 text-white disabled:opacity-40 transition hover:opacity-90"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
