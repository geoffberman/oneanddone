import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }

  let messages: { role: "user" | "assistant"; content: string }[];
  let tournamentName: string;
  try {
    const body = await request.json();
    messages = body.messages;
    tournamentName = body.tournamentName ?? "this tournament";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You are a golf research assistant helping users make picks in a survivor-style golf pool. The current tournament is: ${tournamentName}.

In this pool, players pick one golfer per tournament. They cannot reuse a golfer they've already picked in a previous week — each golfer can only be used once all season. A player is eliminated when their picked golfer misses the cut.

Help users research: course history, recent form, world rankings, weather, course fit, betting odds, and anything else relevant to making a smart pick. Keep responses concise and actionable.`,
      messages,
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return NextResponse.json({ response: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("401") ||
      message.toLowerCase().includes("invalid x-api-key") ||
      message.toLowerCase().includes("invalid api key")
    ) {
      return NextResponse.json(
        { error: "Invalid API key — check yours at console.anthropic.com" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Failed to get response from Claude" },
      { status: 500 }
    );
  }
}
