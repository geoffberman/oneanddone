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
      const results: Record<string, unknown> = {};

      // 1. Check tables — raw SQL with individual error handling
      try {
        const tables = await db.execute(sql`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' ORDER BY table_name
        `);
        results.tables = tables.rows.map((t: Record<string, unknown>) => t.table_name);
      } catch (e) {
        results.tablesError = String(e);
      }

      // 2. Check users table columns — raw SQL
      try {
        const cols = await db.execute(sql`
          SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = 'users' ORDER BY ordinal_position
        `);
        results.userColumns = cols.rows.map(
          (c: Record<string, unknown>) => `${c.column_name} (${c.data_type})`,
        );
      } catch (e) {
        results.userColumnsError = String(e);
      }

      // 3. Check games table columns — raw SQL
      try {
        const gameCols = await db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'games' ORDER BY ordinal_position
        `);
        results.gameColumns = gameCols.rows.map((c: Record<string, unknown>) => c.column_name);
      } catch (e) {
        results.gameColumnsError = String(e);
      }

      // 4. Check user exists — raw SQL only (no Drizzle ORM)
      if (email) {
        try {
          const userResult = await db.execute(
            sql`SELECT id, name, email, CASE WHEN password IS NOT NULL THEN 'yes' ELSE 'no' END as has_pw FROM users WHERE email = ${email} LIMIT 1`
          );
          results.user = userResult.rows[0] || "NOT FOUND";
        } catch (e) {
          results.userQueryError = String(e);
          // Fallback: try counting users
          try {
            const cnt = await db.execute(sql`SELECT count(*) as cnt FROM users`);
            results.userCount = cnt.rows[0];
          } catch (e2) {
            results.userCountError = String(e2);
          }
        }
      }

      // 5. Check environment
      results.env = {
        hasDbUrl: !!process.env.DATABASE_URL,
        dbUrlPrefix: process.env.DATABASE_URL
          ? process.env.DATABASE_URL.substring(0, 40) + "..."
          : "NOT SET",
        hasAuthSecret: !!process.env.AUTH_SECRET,
        hasResendKey: !!process.env.RESEND_API_KEY,
        nextauthUrl: process.env.NEXTAUTH_URL || "NOT SET",
        vercelUrl: process.env.VERCEL_URL || "NOT SET",
        nodeEnv: process.env.NODE_ENV,
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

      // Use raw SQL to find user to avoid any ORM issues
      const userResult = await db.execute(
        sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`
      );

      const row = userResult.rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const userId = row.id as string;
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, userId));

      return NextResponse.json({ success: true, message: "Password updated" });
    }

    if (action === "migrate") {
      // Add missing password column to users table
      const migrationResults: string[] = [];

      try {
        // Check if password column already exists
        const check = await db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'password'
        `);

        if (check.rows.length > 0) {
          migrationResults.push("password column already exists");
        } else {
          await db.execute(sql`ALTER TABLE users ADD COLUMN password text`);
          migrationResults.push("Added password column to users table");
        }
      } catch (e) {
        migrationResults.push(`password column error: ${String(e)}`);
      }

      return NextResponse.json({ migrations: migrationResults });
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
