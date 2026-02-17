"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { announcements, gameMembers, users } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function sendAnnouncement(gameId: number, message: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  // Verify user is a manager of this game
  const [membership] = await db
    .select()
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

export async function getAnnouncements(gameId: number, limit = 5) {
  return db
    .select({
      id: announcements.id,
      message: announcements.message,
      authorName: users.name,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .innerJoin(users, eq(announcements.authorId, users.id))
    .where(eq(announcements.gameId, gameId))
    .orderBy(desc(announcements.createdAt))
    .limit(limit);
}
