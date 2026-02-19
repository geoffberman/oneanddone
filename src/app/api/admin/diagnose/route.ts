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

    if (action === "test-members-page") {
      // Simulate the exact queries that /games/[gameId]/members runs
      const testResults: Record<string, unknown> = {};

      try {
        // Find first game
        const gamesResult = await db.execute(sql`SELECT id, name, season_id, invite_code FROM games LIMIT 1`);
        if (!gamesResult.rows.length) {
          return NextResponse.json({ error: "No games found in database" });
        }
        const testGame = gamesResult.rows[0] as Record<string, unknown>;
        testResults.testGame = testGame;
        const gameId = testGame.id as number;

        // Find first member of this game
        const membersRaw = await db.execute(
          sql`SELECT gm.id, gm.game_id, gm.user_id, gm.role, gm.joined_at FROM game_members gm WHERE gm.game_id = ${gameId}`
        );
        testResults.rawMembers = membersRaw.rows;

        const firstMember = membersRaw.rows[0] as Record<string, unknown> | undefined;
        const testUserId = firstMember?.user_id as string | undefined;

        // Test 1: getGameById query (with seasons join)
        try {
          const { getGameById } = await import("@/lib/queries/games");
          const game = await getGameById(gameId);
          testResults.getGameById = game ? "OK" : "returned null";
          testResults.getGameByIdData = game;
        } catch (e) {
          testResults.getGameByIdError = String(e);
          testResults.getGameByIdStack = (e as Error).stack?.substring(0, 500);
        }

        // Test 2: getUserRole query
        try {
          const { getUserRole } = await import("@/lib/queries/games");
          const role = testUserId ? await getUserRole(gameId, testUserId) : "no user to test";
          testResults.getUserRole = role ? "OK: " + role : "returned null";
        } catch (e) {
          testResults.getUserRoleError = String(e);
          testResults.getUserRoleStack = (e as Error).stack?.substring(0, 500);
        }

        // Test 3: getGameMembers query (the most suspicious one)
        try {
          const { getGameMembers } = await import("@/lib/queries/games");
          const members = await getGameMembers(gameId);
          testResults.getGameMembers = `OK: ${members.length} members`;
          testResults.getGameMembersData = members;
        } catch (e) {
          testResults.getGameMembersError = String(e);
          testResults.getGameMembersStack = (e as Error).stack?.substring(0, 500);
        }

        // Test 4: Try the raw join query directly
        try {
          const rawJoin = await db.execute(sql`
            SELECT gm.id, gm.user_id, u.name as user_name, u.image as user_image,
                   gm.role, gm.joined_at
            FROM game_members gm
            INNER JOIN users u ON gm.user_id = u.id
            WHERE gm.game_id = ${gameId}
          `);
          testResults.rawJoinQuery = `OK: ${rawJoin.rows.length} rows`;
          testResults.rawJoinData = rawJoin.rows;
        } catch (e) {
          testResults.rawJoinError = String(e);
        }

        // Test 5: Check seasons table has data
        try {
          const seasonsResult = await db.execute(sql`SELECT id, year FROM seasons LIMIT 5`);
          testResults.seasons = seasonsResult.rows;
        } catch (e) {
          testResults.seasonsError = String(e);
        }

        // Test 6: Check if game's season exists
        try {
          const seasonCheck = await db.execute(
            sql`SELECT s.id, s.year FROM seasons s
                INNER JOIN games g ON g.season_id = s.id
                WHERE g.id = ${gameId}`
          );
          testResults.gameSeasonJoin = seasonCheck.rows.length > 0 ? "OK" : "NO MATCHING SEASON";
          testResults.gameSeasonData = seasonCheck.rows;
        } catch (e) {
          testResults.gameSeasonError = String(e);
        }

        // Test 7: list all users
        try {
          const usersResult = await db.execute(sql`SELECT id, name, email FROM users LIMIT 10`);
          testResults.users = usersResult.rows;
        } catch (e) {
          testResults.usersError = String(e);
        }

      } catch (e) {
        testResults.topLevelError = String(e);
        testResults.topLevelStack = (e as Error).stack?.substring(0, 500);
      }

      return NextResponse.json(testResults);
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

    if (action === "sync-debug") {
      // Step-by-step sync diagnostic — shows exactly what happens at each stage
      const diag: Record<string, unknown> = {};

      // 1. Check tournament_results table and indexes
      try {
        const idxCheck = await db.execute(sql`
          SELECT indexname, indexdef FROM pg_indexes
          WHERE tablename = 'tournament_results'
        `);
        diag.tournamentResultsIndexes = idxCheck.rows;
      } catch (e) {
        diag.indexCheckError = String(e);
      }

      // 2. Count existing tournament_results
      try {
        const countResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM tournament_results`);
        diag.existingResultsCount = countResult.rows[0];
      } catch (e) {
        diag.countError = String(e);
      }

      // 3. Find active tournaments (same query as syncResults)
      try {
        const active = await db.execute(sql`
          SELECT id, name, external_tournament_id, start_date, is_over, is_in_progress, canceled
          FROM tournaments
          WHERE canceled = false AND (is_in_progress = true OR is_over = false)
        `);
        diag.activeTournaments = active.rows;

        // 4. Filter to started & not over
        const now = new Date();
        const toSync = active.rows.filter(
          (t: Record<string, unknown>) =>
            new Date(t.start_date as string) <= now && !(t.is_over as boolean)
        );
        diag.tournamentsToSync = toSync;

        if (toSync.length > 0) {
          const t = toSync[0] as Record<string, unknown>;
          const extId = t.external_tournament_id as number;
          diag.testingTournament = { name: t.name, id: t.id, externalId: extId };

          // 5. Fetch leaderboard from API
          try {
            const { fetchLeaderboard } = await import("@/lib/sportsdata/client");
            const lb = await fetchLeaderboard(extId);
            diag.leaderboardTournament = {
              IsOver: lb.Tournament.IsOver,
              IsInProgress: lb.Tournament.IsInProgress,
            };
            diag.leaderboardPlayerCount = lb.Players?.length ?? 0;

            // Show first 3 players as sample
            diag.samplePlayers = (lb.Players || []).slice(0, 3).map((p) => ({
              PlayerID: p.PlayerID,
              Name: `${p.FirstName} ${p.LastName}`,
              Rank: p.Rank,
              Earnings: p.Earnings,
              TotalScore: p.TotalScore,
              TotalStrokes: p.TotalStrokes,
              MadeCut: p.MadeCut,
              Rounds: p.Rounds?.length,
            }));

            // 6. Check golfer match rate
            if (lb.Players && lb.Players.length > 0) {
              const playerIds = lb.Players.map((p) => p.PlayerID);
              const golferCheck = await db.execute(sql`
                SELECT id, external_player_id FROM golfers
                WHERE external_player_id = ANY(${playerIds})
              `);
              diag.golferMatchCount = golferCheck.rows.length;
              diag.golferMatchRate = `${golferCheck.rows.length}/${playerIds.length}`;

              // 7. Actually run syncResults and capture the result
              try {
                const { syncResults } = await import("@/lib/sportsdata/sync-results");
                const syncResult = await syncResults();
                diag.syncResult = syncResult;
              } catch (syncErr) {
                diag.syncError = String(syncErr);
                diag.syncStack = (syncErr as Error).stack?.substring(0, 800);
              }

              // 8. Count results after sync
              try {
                const afterCount = await db.execute(sql`
                  SELECT COUNT(*) as cnt FROM tournament_results
                  WHERE tournament_id = ${t.id as number}
                `);
                diag.resultsAfterSync = afterCount.rows[0];
              } catch (e) {
                diag.resultsAfterSyncError = String(e);
              }
            }
          } catch (apiErr) {
            diag.leaderboardApiError = String(apiErr);
            diag.leaderboardApiStack = (apiErr as Error).stack?.substring(0, 500);
          }
        }
      } catch (e) {
        diag.activeTournamentsError = String(e);
      }

      return NextResponse.json(diag);
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
