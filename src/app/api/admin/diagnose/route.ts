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

      // 1. Check tables
      try {
        const tables = await db.execute(sql`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' ORDER BY table_name
        `);
        results.tables = tables.rows.map((t: Record<string, unknown>) => t.table_name);
      } catch (e) {
        results.tablesError = String(e);
      }

      // 2. Check ALL table columns
      const tablesToCheck = ["users", "games", "game_members", "picks", "seasons", "tournaments", "golfers"];
      for (const table of tablesToCheck) {
        try {
          const cols = await db.execute(sql`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = ${table} ORDER BY ordinal_position
          `);
          results[`${table}_columns`] = cols.rows.map(
            (c: Record<string, unknown>) => ({
              col: c.column_name,
              type: c.data_type,
              nullable: c.is_nullable,
              default: c.column_default ? String(c.column_default).substring(0, 50) : null,
            }),
          );
        } catch (e) {
          results[`${table}_columns_error`] = String(e);
        }
      }

      // 3. Check user exists
      if (email) {
        try {
          const userResult = await db.execute(
            sql`SELECT id, name, email, CASE WHEN password IS NOT NULL THEN 'yes' ELSE 'no' END as has_pw FROM users WHERE email = ${email} LIMIT 1`
          );
          results.user = userResult.rows[0] || "NOT FOUND";
        } catch (e) {
          results.userQueryError = String(e);
        }
      }

      // 4. Check sequences
      try {
        const seqs = await db.execute(sql`
          SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
        `);
        results.sequences = seqs.rows.map((s: Record<string, unknown>) => s.sequencename);
      } catch (e) {
        results.sequencesError = String(e);
      }

      // 5. Check enum types
      try {
        const enums = await db.execute(sql`
          SELECT t.typname, string_agg(e.enumlabel, ', ') as values
          FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
          GROUP BY t.typname
        `);
        results.enums = enums.rows;
      } catch (e) {
        results.enumsError = String(e);
      }

      // 6. Environment
      results.env = {
        hasDbUrl: !!process.env.DATABASE_URL,
        dbUrlPrefix: process.env.DATABASE_URL
          ? process.env.DATABASE_URL.substring(0, 40) + "..."
          : "NOT SET",
        hasAuthSecret: !!process.env.AUTH_SECRET,
        hasResendKey: !!process.env.RESEND_API_KEY,
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
      const results: string[] = [];

      async function addCol(table: string, column: string, colType: string) {
        try {
          const check = await db.execute(
            sql`SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`
          );
          if (check.rows.length > 0) {
            results.push(`${table}.${column} exists`);
          } else {
            await db.execute(sql.raw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${colType}`));
            results.push(`Added ${table}.${column}`);
          }
        } catch (e) {
          results.push(`ERR ${table}.${column}: ${String(e)}`);
        }
      }

      async function createTable(table: string, ddl: string) {
        try {
          const check = await db.execute(
            sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${table}`
          );
          if (check.rows.length > 0) {
            results.push(`${table} table exists`);
          } else {
            await db.execute(sql.raw(ddl));
            results.push(`Created ${table} table`);
          }
        } catch (e) {
          results.push(`ERR creating ${table}: ${String(e)}`);
        }
      }

      // -- Missing columns --
      await addCol("users", "password", "text");
      await addCol("users", "display_name", "text");
      await addCol("users", "created_at", "timestamp DEFAULT now() NOT NULL");
      await addCol("games", "rules", "text");
      await addCol("picks", "active_golfer_id", 'integer REFERENCES "golfers"("id")');
      await addCol("picks", "alternate_activated", "boolean NOT NULL DEFAULT false");
      await addCol("picks", "earnings", "numeric(12,2) DEFAULT '0'");

      // -- Missing tables --
      await createTable(
        "announcements",
        `CREATE TABLE "announcements" (
          "id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
          "game_id" integer NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
          "author_id" text NOT NULL REFERENCES "users"("id"),
          "message" text NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL
        )`
      );

      await createTable(
        "password_reset_tokens",
        `CREATE TABLE "password_reset_tokens" (
          "id" text PRIMARY KEY,
          "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "token" text NOT NULL UNIQUE,
          "expires_at" timestamp NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL
        )`
      );

      try {
        await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "idx_announcement_game" ON "announcements" ("game_id")`));
        results.push("announcement index OK");
      } catch (_e) { /* ignore */ }

      return NextResponse.json({ migrations: results });
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
