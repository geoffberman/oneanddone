import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { sendPasswordResetEmail } from "@/lib/email";

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "token" text NOT NULL UNIQUE,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 },
      );
    }

    const [user] = await db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!user || !user.password) {
      return NextResponse.json({ success: true });
    }

    await ensureTable();

    // Delete any existing tokens for this user
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    // Create a new token (expires in 1 hour)
    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(passwordResetTokens).values({
      id: crypto.randomUUID(),
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    // Send the email via Resend
    const emailSent = await sendPasswordResetEmail(email, resetUrl);

    if (!emailSent) {
      // Fallback: log the URL so it's visible in Vercel function logs
      console.log(`[Password Reset] ${email}: ${resetUrl}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Forgot Password Error]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
