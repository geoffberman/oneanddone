"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { announcements, gameMembers, users, games, seasons } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendManagerEmail } from "@/lib/email";

export async function sendAnnouncement(gameId: number, message: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  // Verify user is a manager of this game
  const [membership] = await db
    .select({ id: gameMembers.id })
    .from(gameMembers)
    .where(
      and(
        eq(gameMembers.gameId, gameId),
        eq(gameMembers.userId, session.user.id),
        eq(gameMembers.role, "manager")
      )
    )
    .limit(1);

  if (!membership) throw new Error("Only league managers can send announcements");

  const trimmed = message.trim();
  if (!trimmed) throw new Error("Message cannot be empty");

  await db.insert(announcements).values({
    id: sql`nextval('announcements_id_seq')`,
    gameId,
    authorId: session.user.id,
    message: trimmed,
    createdAt: new Date(),
  });

  revalidatePath(`/games/${gameId}`);
}

export async function emailMembers(
  gameId: number,
  subject: string,
  message: string,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  // Verify manager
  const [membership] = await db
    .select({ id: gameMembers.id })
    .from(gameMembers)
    .where(
      and(
        eq(gameMembers.gameId, gameId),
        eq(gameMembers.userId, session.user.id),
        eq(gameMembers.role, "manager")
      )
    )
    .limit(1);
  if (!membership) throw new Error("Only managers can email members");

  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();
  if (!trimmedSubject || !trimmedMessage) throw new Error("Subject and message are required");

  // Get game name
  const [game] = await db
    .select({ name: games.name })
    .from(games)
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .where(eq(games.id, gameId))
    .limit(1);
  if (!game) throw new Error("Game not found");

  // Get all members with email
  const members = await db
    .select({
      name: users.name,
      displayName: users.displayName,
      email: users.email,
    })
    .from(gameMembers)
    .innerJoin(users, eq(gameMembers.userId, users.id))
    .where(eq(gameMembers.gameId, gameId));

  let sent = 0;
  for (const member of members) {
    if (!member.email) continue;
    const displayName = member.displayName || member.name || "there";
    await sendManagerEmail(member.email, displayName, game.name, trimmedSubject, trimmedMessage);
    sent++;
  }

  return { sent };
}

export async function getAnnouncements(gameId: number, limit = 5) {
  return db
    .select({
      id: announcements.id,
      message: announcements.message,
      authorName: sql<string | null>`COALESCE(${users.displayName}, ${users.name})`,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .innerJoin(users, eq(announcements.authorId, users.id))
    .where(eq(announcements.gameId, gameId))
    .orderBy(desc(announcements.createdAt))
    .limit(limit);
}
