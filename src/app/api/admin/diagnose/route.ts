import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Temporary diagnostic endpoint — remove after debugging
// Secured with CRON_SECRET to prevent unauthorized access
export async function POST(req: Request) {
  try {
    const { secret, action, email, newPassword } = await req.json();

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (action === "diagnose") {
      // Check DB connectivity and schema state
      const results: Record<string, unknown> = {};

      // 1. Check tables
      const tables = await db.execute(sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name
      `);
      results.tables = tables.rows.map((t: Record<string, unknown>) => t.table_name);

      // 2. Check users table columns
      const cols = await db.execute(sql`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'users' ORDER BY ordinal_position
      `);
      results.userColumns = cols.rows.map(
        (c: Record<string, unknown>) => `${c.column_name} (${c.data_type})`,
      );

      // 3. Check games table columns
      const gameCols = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'games' ORDER BY ordinal_position
      `);
      results.gameColumns = gameCols.rows.map((c: Record<string, unknown>) => c.column_name);

      // 4. Check if target user exists
      if (email) {
        const [user] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            password: users.password,
          })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (user) {
          results.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            hasPassword: !!user.password,
            passwordPrefix: user.password ? user.password.substring(0, 10) + "..." : null,
          };
        } else {
          results.user = "NOT FOUND";
        }
      }

      // 5. Check environment
      results.env = {
        hasDbUrl: !!process.env.DATABASE_URL,
        hasAuthSecret: !!process.env.AUTH_SECRET,
        hasResendKey: !!process.env.RESEND_API_KEY,
        nextauthUrl: process.env.NEXTAUTH_URL || "NOT SET",
        vercelUrl: process.env.VERCEL_URL || "NOT SET",
      };

      return NextResponse.json(results);
    }

    if (action === "reset-password") {
      if (!email || !newPassword) {
        return NextResponse.json(
          { error: "email and newPassword required" },
          { status: 400 },
        );
      }

      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, user.id));

      return NextResponse.json({ success: true, message: "Password updated" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[Admin Diagnose]", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
