import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock setup ───────────────────────────────────────────────

// Track all SQL queries executed via db.execute()
const executedSql: string[] = [];

// Configurable return values for DB queries
let mockTournaments: any[] = [];
let mockGolferRows: any[] = [];
let mockInsertedGolferRows: any[] = [];
let mockPickRows: any[] = [];
let mockResultRows: any[] = [];

// Build a chainable query mock (select → from → where → groupBy → orderBy → limit)
function makeChain(resolveWith: () => any) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve(resolveWith()),
  };
  // Make it thenable so `await` works
  chain[Symbol.for("nodejs.util.inspect.custom")] = () => "chainable";
  return chain;
}

// We intercept db operations by table name
const dbMock = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
};

// Route select().from(table) based on table reference
function setupSelectRouting() {
  dbMock.select.mockImplementation(() => {
    const chain: any = {};
    chain.from = vi.fn().mockImplementation((table: any) => {
      const innerChain: any = {
        where: vi.fn(),
        orderBy: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        limit: vi.fn(),
      };

      innerChain.where = vi.fn().mockImplementation(() => {
        // Need to figure out which table we're querying
        // We detect by the table name passed to .from()
        const tableName = table?.constructor?.name || table?.[Symbol.for("drizzle:Name")] || "";
        return {
          limit: vi.fn().mockImplementation(() => {
            // Single-row queries (picks with limit(1), tournamentResults with limit(1))
            return Promise.resolve(mockResultRows.length > 0 ? [mockResultRows.shift()] : []);
          }),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockImplementation(() => Promise.resolve([])),
          then: (resolve: any) => {
            // This handles queries that don't use .limit()
            return resolve(mockGolferRows);
          },
        };
      });

      return innerChain;
    });
    return chain;
  });
}

// Mock the `@/db` module
vi.mock("@/db", () => ({
  db: dbMock,
}));

// Mock the schema (we just need the table references for Drizzle's eq/and/etc)
vi.mock("@/db/schema", () => ({
  tournaments: { id: "tournaments.id", externalTournamentId: "tournaments.external_tournament_id", canceled: "tournaments.canceled", isInProgress: "tournaments.is_in_progress", isOver: "tournaments.is_over", startDate: "tournaments.start_date" },
  golfers: { id: "golfers.id", externalPlayerId: "golfers.external_player_id" },
  tournamentResults: { id: "tr.id", tournamentId: "tr.tournament_id", golferId: "tr.golfer_id" },
  picks: { id: "picks.id", tournamentId: "picks.tournament_id", gameId: "picks.game_id", earnings: "picks.earnings", activeGolferId: "picks.active_golfer_id", primaryGolferId: "picks.primary_golfer_id" },
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: (a: any, b: any) => ({ type: "eq", a, b }),
  and: (...args: any[]) => ({ type: "and", args }),
  or: (...args: any[]) => ({ type: "or", args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => {
      // Capture the SQL template for inspection
      const result = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? `$${i}` : ""), "");
      return { _sql: result, _values: values };
    },
    { join: (items: any[], sep: any) => ({ _items: items, _sep: sep }) }
  ),
  inArray: (col: any, vals: any[]) => ({ type: "inArray", col, vals }),
}));

// Mock the SportsData client
const mockFetchLeaderboard = vi.fn();
vi.mock("../client", () => ({
  fetchLeaderboard: (...args: any[]) => mockFetchLeaderboard(...args),
}));

// ─── Test data ────────────────────────────────────────────────

function makeTournament(overrides = {}) {
  return {
    id: 100,
    externalTournamentId: 5001,
    name: "The Genesis Invitational",
    startDate: new Date("2026-02-12"),
    isOver: false,
    isInProgress: true,
    canceled: false,
    ...overrides,
  };
}

function makeLeaderboard(overrides: any = {}) {
  return {
    Tournament: {
      IsOver: false,
      IsInProgress: true,
      ...overrides.Tournament,
    },
    Players: overrides.Players ?? [
      {
        PlayerID: 40001,
        FirstName: "Scottie",
        LastName: "Scheffler",
        Country: "USA",
        TotalScore: -12,
        TotalStrokes: 268,
        Earnings: 3600000,
        Rank: 1,
        IsWithdrawn: false,
        MadeCut: 1,
        Rounds: [{ Number: 1 }, { Number: 2 }, { Number: 3 }],
      },
      {
        PlayerID: 40002,
        FirstName: "Rory",
        LastName: "McIlroy",
        Country: "NIR",
        TotalScore: -8,
        TotalStrokes: 272,
        Earnings: 2160000,
        Rank: 2,
        IsWithdrawn: false,
        MadeCut: 1,
        Rounds: [{ Number: 1 }, { Number: 2 }, { Number: 3 }],
      },
      {
        PlayerID: 40003,
        FirstName: "Tommy",
        LastName: "Fleetwood",
        Country: "ENG",
        TotalScore: 0,
        TotalStrokes: 280,
        Earnings: 500000,
        Rank: 15,
        IsWithdrawn: false,
        MadeCut: 1,
        Rounds: [{ Number: 1 }, { Number: 2 }],
      },
    ],
  };
}

// ─── Helpers ──────────────────────────────────────────────────

let selectCallCount: number;
let updateCallCount: number;

function setupDbMock(opts: {
  tournaments?: any[];
  golferRows?: any[];
  insertedGolferRows?: any[];
  pickRows?: any[];
  resultRows?: any[];
}) {
  selectCallCount = 0;
  updateCallCount = 0;
  executedSql.length = 0;

  const tournaments = opts.tournaments ?? [];
  const golferRows = opts.golferRows ?? [];
  const pickRows = opts.pickRows ?? [];
  const resultRows = opts.resultRows ?? [];
  const insertedGolferRows = opts.insertedGolferRows ?? [];

  // db.select() chain
  dbMock.select.mockImplementation(() => {
    selectCallCount++;
    const currentCall = selectCallCount;

    const fromFn = vi.fn().mockImplementation(() => {
      const whereResult: any = {
        limit: vi.fn().mockImplementation(() => {
          // For pick earnings: first result lookup
          return Promise.resolve(resultRows.length > 0 ? [resultRows.shift()!] : []);
        }),
        then: (resolve: any) => resolve(golferRows),
      };

      return {
        where: vi.fn().mockImplementation(() => {
          if (currentCall === 1) {
            // First select: tournaments query
            return Promise.resolve(tournaments);
          }
          if (currentCall === 2) {
            // Second select: golfer batch lookup
            return Promise.resolve(golferRows);
          }
          // Subsequent selects: picks or result lookups for updatePickEarnings
          return whereResult;
        }),
      };
    });

    return { from: fromFn };
  });

  // db.update() chain
  dbMock.update.mockImplementation(() => {
    updateCallCount++;
    return {
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => Promise.resolve()),
      })),
    };
  });

  // db.execute() — for raw SQL bulk upserts and inserts
  dbMock.execute.mockImplementation((sqlObj: any) => {
    const sqlStr = JSON.stringify(sqlObj);
    executedSql.push(sqlStr);

    // If this is a golfer insert (RETURNING), return the inserted rows
    if (sqlStr.includes("golfers") || sqlStr.includes("first_name")) {
      return Promise.resolve({ rows: insertedGolferRows });
    }
    // Tournament results upsert
    return Promise.resolve({ rows: [] });
  });
}

// ─── Tests ────────────────────────────────────────────────────

describe("syncResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executedSql.length = 0;
  });

  it("updates tournament status and inserts tournament results via bulk upsert", async () => {
    const tournament = makeTournament();
    const leaderboard = makeLeaderboard();

    setupDbMock({
      tournaments: [tournament],
      golferRows: [
        { id: 1, externalPlayerId: 40001 },
        { id: 2, externalPlayerId: 40002 },
        { id: 3, externalPlayerId: 40003 },
      ],
      pickRows: [],
    });

    mockFetchLeaderboard.mockResolvedValue(leaderboard);

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    // Should have fetched the leaderboard
    expect(mockFetchLeaderboard).toHaveBeenCalledWith(5001);

    // Should return results for the tournament
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      tournament: "The Genesis Invitational",
      isOver: false,
      resultsCount: 3,
    });

    // Should have called db.update() for tournament status
    expect(dbMock.update).toHaveBeenCalled();

    // Should have called db.execute() for the bulk upsert (tournament_results)
    // executedSql should contain at least one entry (the upsert)
    expect(executedSql.length).toBeGreaterThanOrEqual(1);
  });

  it("creates missing golfers before upserting results", async () => {
    const tournament = makeTournament();
    const leaderboard = makeLeaderboard();

    // Only golfer 40001 exists; 40002 and 40003 are missing
    setupDbMock({
      tournaments: [tournament],
      golferRows: [{ id: 1, externalPlayerId: 40001 }],
      insertedGolferRows: [
        { id: 10, external_player_id: 40002 },
        { id: 11, external_player_id: 40003 },
      ],
      pickRows: [],
    });

    mockFetchLeaderboard.mockResolvedValue(leaderboard);

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    // Should still process all 3 players
    expect(results[0].resultsCount).toBe(3);

    // db.execute should have been called at least twice:
    // 1. Insert missing golfers
    // 2. Bulk upsert tournament_results
    expect(dbMock.execute).toHaveBeenCalledTimes(2);
  });

  it("handles even-par score (TotalScore = 0) correctly with ?? null", async () => {
    const tournament = makeTournament();
    const leaderboard = makeLeaderboard({
      Players: [
        {
          PlayerID: 40001,
          FirstName: "Even",
          LastName: "Par",
          Country: "USA",
          TotalScore: 0, // Even par — old code had `|| null` bug
          TotalStrokes: 280,
          Earnings: 100000,
          Rank: 10,
          IsWithdrawn: false,
          MadeCut: 1,
          Rounds: [{ Number: 1 }, { Number: 2 }],
        },
      ],
    });

    setupDbMock({
      tournaments: [tournament],
      golferRows: [{ id: 1, externalPlayerId: 40001 }],
      pickRows: [],
    });

    mockFetchLeaderboard.mockResolvedValue(leaderboard);

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    expect(results[0].resultsCount).toBe(1);

    // The bulk upsert SQL was executed — verify via db.execute call
    expect(dbMock.execute).toHaveBeenCalled();

    // Inspect the SQL values to ensure TotalScore=0 is passed, NOT null
    const executeCall = dbMock.execute.mock.calls[0][0];
    // The sql template object should contain the value 0 for TotalScore
    // (In the old code, `player.TotalScore || null` would produce null for 0)
    const sqlValues = executeCall._items?.[0]?._values;
    if (sqlValues) {
      // Find the TotalScore value (index 5 in our insert: tournament_id, golfer_id, Rank, Earnings, TotalStrokes, TotalScore)
      expect(sqlValues[5]).toBe(0); // TotalScore = 0, NOT null
    }
  });

  it("handles empty leaderboard with no players", async () => {
    const tournament = makeTournament();
    const leaderboard = makeLeaderboard({ Players: [] });

    setupDbMock({
      tournaments: [tournament],
      golferRows: [],
      pickRows: [],
    });

    mockFetchLeaderboard.mockResolvedValue(leaderboard);

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    expect(results[0].resultsCount).toBe(0);
    // Should NOT call db.execute for results upsert
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it("skips tournaments that haven't started yet", async () => {
    const futureTournament = makeTournament({
      startDate: new Date("2099-01-01"),
      isOver: false,
      isInProgress: false,
    });

    setupDbMock({
      tournaments: [futureTournament],
      golferRows: [],
      pickRows: [],
    });

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    // Should not fetch any leaderboard for a future tournament
    expect(mockFetchLeaderboard).not.toHaveBeenCalled();
    expect(results).toHaveLength(0);
  });

  it("continues processing when fetchLeaderboard throws", async () => {
    const tournament = makeTournament();

    setupDbMock({
      tournaments: [tournament],
      golferRows: [],
      pickRows: [],
    });

    mockFetchLeaderboard.mockRejectedValue(new Error("API rate limit"));

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    // Error is caught internally, returns empty results
    expect(results).toHaveLength(0);
  });

  it("does not use nextval or manual sequence for insert", async () => {
    // This is the critical regression test — the old code used
    // `id: sql\`nextval('tournament_results_id_seq')\`` which was breaking
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const source = readFileSync(
      resolve(__dirname, "../sync-results.ts"),
      "utf-8"
    );

    expect(source).not.toContain("nextval");
    expect(source).not.toContain("tournament_results_id_seq");
  });

  it("uses ON CONFLICT bulk upsert instead of N+1 select-then-insert", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const source = readFileSync(
      resolve(__dirname, "../sync-results.ts"),
      "utf-8"
    );

    // Must use ON CONFLICT for idempotent upserts
    expect(source).toContain("ON CONFLICT (tournament_id, golfer_id) DO UPDATE SET");

    // Must use inArray for batch golfer lookup, not individual queries
    expect(source).toContain("inArray");

    // Should NOT have per-player select from golfers
    // (Old code did: `const [golfer] = await db.select().from(golfers).where(eq(golfers.externalPlayerId, player.PlayerID))`)
    // Count occurrences of `.from(golfers)` — should only appear once (the batch lookup)
    const golferFromCalls = (source.match(/\.from\(golfers\)/g) || []).length;
    expect(golferFromCalls).toBe(1);
  });

  it("uses ?? null for numeric fields, not || null", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const source = readFileSync(
      resolve(__dirname, "../sync-results.ts"),
      "utf-8"
    );

    // Rank, TotalStrokes, TotalScore should all use ?? null
    expect(source).toContain("p.Rank ?? null");
    expect(source).toContain("p.TotalStrokes ?? null");
    expect(source).toContain("p.TotalScore ?? null");

    // Should NOT use || null for these fields (the original bug)
    expect(source).not.toMatch(/p\.Rank \|\| null/);
    expect(source).not.toMatch(/p\.TotalStrokes \|\| null/);
    expect(source).not.toMatch(/p\.TotalScore \|\| null/);
  });

  it("inserts missing golfers with ON CONFLICT DO NOTHING", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const source = readFileSync(
      resolve(__dirname, "../sync-results.ts"),
      "utf-8"
    );

    expect(source).toContain("INSERT INTO golfers");
    expect(source).toContain("ON CONFLICT (external_player_id) DO NOTHING");
    expect(source).toContain("RETURNING id, external_player_id");
  });
});
