/**
 * Production-safe migration script for Vercel + Neon.
 *
 * Problem: The DB was originally set up without Drizzle migration tracking
 * (drizzle.__drizzle_migrations). Running `drizzle-kit migrate` cold would
 * attempt to re-apply ALL migrations and fail on duplicate objects (e.g.
 * CREATE TYPE "member_role" from migration 0000 already exists).
 *
 * Fix: Before running the Drizzle migrator, check whether the schema from
 * the early migrations already exists. If it does but the tracking table is
 * empty, seed a tracking record for the last pre-existing migration so the
 * migrator only applies genuinely new ones.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "path";
import { createHash } from "crypto";
import { readFileSync } from "fs";

// Timestamps from drizzle/meta/_journal.json — used as migration IDs.
// Update this value to match the `when` of the last migration that was
// applied to production before Drizzle tracking was introduced.
const LAST_UNTRACKED_MIGRATION_WHEN = 1771336689700; // 0003_neat_whizzer
const LAST_UNTRACKED_MIGRATION_FILE = "0003_neat_whizzer.sql";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const sql = postgres(connectionString, { max: 1 });

  try {
    // Check whether the enum from migration 0000 exists, which means the
    // early migrations were applied to this DB without Drizzle tracking.
    const [enumExists] = await sql`
      SELECT 1
      FROM pg_type
      WHERE typname = 'member_role'
        AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    `;

    if (enumExists) {
      // Early migrations already applied — set up tracking table and seed it
      // so the Drizzle migrator skips them.
      await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
      await sql`
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
          id   SERIAL PRIMARY KEY,
          hash TEXT   NOT NULL,
          created_at BIGINT
        )
      `;

      const [existing] =
        await sql`SELECT id FROM drizzle.__drizzle_migrations LIMIT 1`;

      if (!existing) {
        const content = readFileSync(
          join(process.cwd(), "drizzle", LAST_UNTRACKED_MIGRATION_FILE),
          "utf-8",
        );
        const hash = createHash("sha256").update(content).digest("hex");

        await sql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${LAST_UNTRACKED_MIGRATION_WHEN})
        `;
        console.log(
          `Seeded migration tracking through ${LAST_UNTRACKED_MIGRATION_FILE}`,
        );
      }
    }

    // Run Drizzle's standard migrator — will only apply unapplied migrations.
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
    console.log("Migrations complete");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
