import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock setup ───────────────────────────────────────────────

// Track operations for assertions
const operations: string[] = [];
let deletedTournamentIds: number[] = [];
let insertedResults: any[][] = [];
let insertedGolferValues: any[] = [];

// Configurable return values for DB queries
let selectCallCount = 0;
let mockTournaments: any[] = [];
let mockGolferRows: any[] = [];
let mockPickRows: any[] = [];
let mockResultRows: any[] = [];

// Build chainable insert mock for golfers
function makeInsertChain(tableName: string) {
  return {
    values: vi.fn().mockImplementation((vals: any) => {
      if (tableName === "golfers") {
        insertedGolferValues.push(vals);
      } else {
        insertedResults.push(Array.isArray(vals) ? vals : [vals]);
      }
      return {
        onConflictDoNothing: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockImplementation(() => {
            // For golfer inserts: return the inserted row
            if (tableName === "golfers") {
              const v = Array.isArray(vals) ? vals[0] : vals;
              return Promise.resolve([{ id: 100 + insertedGolferValues.length }]);
            }
            return Promise.resolve([]);
          }),
        })),
        then: (resolve: any) => resolve(undefined),
      };
    }),
  };
}

const dbMock: any = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
};

function setupDbMock(opts: {
  tournaments?: any[];
  golferRows?: any[];
  pickRows?: any[];
  resultRows?: any[];
}) {
  selectCallCount = 0;
  operations.length = 0;
  deletedTournamentIds.length = 0;
  insertedResults.length = 0;
  insertedGolferValues.length = 0;

  mockTournaments = opts.tournaments ?? [];
  mockGolferRows = opts.golferRows ?? [];
  mockPickRows = opts.pickRows ?? [];
  mockResultRows = [...(opts.resultRows ?? [])];

  // db.select() chain
  dbMock.select.mockImplementation(() => {
    selectCallCount++;
    const currentCall = selectCallCount;

    return {
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          if (currentCall === 1) {
            // First select: tournaments query
            return Promise.resolve(mockTournaments);
          }
          if (currentCall === 2) {
            // Second select: golfer batch lookup
            return Promise.resolve(mockGolferRows);
          }
          // Subsequent: picks or result lookups for updatePickEarnings
          return {
            limit: vi.fn().mockImplementation(() => {
              return Promise.resolve(
                mockResultRows.length > 0 ? [mockResultRows.shift()!] : []
              );
            }),
            then: (resolve: any) => resolve(mockPickRows),
          };
        }),
      })),
    };
  });

  // db.update() chain
  dbMock.update.mockImplementation(() => ({
    set: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => Promise.resolve()),
    })),
  }));

  // db.insert() - for golfer inserts and tournament result upserts
  dbMock.insert.mockImplementation((table: any) => {
    const tableName =
      table === "golfers" || table?.id === "golfers.id" ? "golfers" : "results";
    operations.push(`insert:${tableName}`);
    if (tableName === "results") {
      return {
        values: vi.fn().mockImplementation((vals: any) => {
          insertedResults.push(Array.isArray(vals) ? vals : [vals]);
          return {
            onConflictDoUpdate: vi.fn().mockImplementation(() => {
              operations.push("upsert:results");
              return Promise.resolve();
            }),
          };
        }),
      };
    }
    return makeInsertChain(tableName);
  });

  // db.execute() — for any remaining raw SQL
  dbMock.execute.mockImplementation(() => Promise.resolve({ rows: [] }));
}

// Mock the `@/db` module
vi.mock("@/db", () => ({
  db: dbMock,
}));

// Mock the schema
vi.mock("@/db/schema", () => ({
  tournaments: {
    id: "tournaments.id",
    externalTournamentId: "tournaments.external_tournament_id",
    canceled: "tournaments.canceled",
    isInProgress: "tournaments.is_in_progress",
    isOver: "tournaments.is_over",
    startDate: "tournaments.start_date",
  },
  golfers: {
    id: "golfers.id",
    externalPlayerId: "golfers.external_player_id",
  },
  tournamentResults: {
    id: "tr.id",
    tournamentId: "tr.tournament_id",
    golferId: "tr.golfer_id",
  },
  picks: {
    id: "picks.id",
    tournamentId: "picks.tournament_id",
    gameId: "picks.game_id",
    earnings: "picks.earnings",
    activeGolferId: "picks.active_golfer_id",
    primaryGolferId: "picks.primary_golfer_id",
  },
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: (a: any, b: any) => ({ type: "eq", a, b }),
  and: (...args: any[]) => ({ type: "and", args }),
  or: (...args: any[]) => ({ type: "or", args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => {
      const result = strings.reduce(
        (acc, str, i) => acc + str + (values[i] !== undefined ? `$${i}` : ""),
        ""
      );
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
    Players:
      overrides.Players ?? [
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

// ─── Tests ────────────────────────────────────────────────────

describe("syncResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    operations.length = 0;
  });

  it("updates tournament status and upserts results", async () => {
    const tournament = makeTournament();
    const leaderboard = makeLeaderboard();

    setupDbMock({
      tournaments: [tournament],
      golferRows: [
        { id: 1, externalPlayerId: 40001 },
        { id: 2, externalPlayerId: 40002 },
        { id: 3, externalPlayerId: 40003 },
      ],
    });

    mockFetchLeaderboard.mockResolvedValue(leaderboard);

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    expect(mockFetchLeaderboard).toHaveBeenCalledWith(5001);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      tournament: "The Genesis Invitational",
      isOver: false,
      resultsCount: 3,
    });

    // Should have called db.update() for tournament status
    expect(dbMock.update).toHaveBeenCalled();

    // Should upsert results (no transaction — Neon HTTP driver doesn't support them)
    expect(operations).toContain("insert:results");
    expect(operations).toContain("upsert:results");
  });

  it("creates missing golfers before inserting results", async () => {
    const tournament = makeTournament();
    const leaderboard = makeLeaderboard();

    // Only golfer 40001 exists; 40002 and 40003 are missing
    setupDbMock({
      tournaments: [tournament],
      golferRows: [{ id: 1, externalPlayerId: 40001 }],
    });

    // After the insert, we need the select to find the newly-inserted golfer
    // The mock handles this by returning an id from onConflictDoNothing().returning()

    mockFetchLeaderboard.mockResolvedValue(leaderboard);

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    // Should still process all 3 players
    expect(results[0].resultsCount).toBe(3);

    // db.insert should have been called for missing golfers
    expect(dbMock.insert).toHaveBeenCalled();
  });

  it("handles even-par score (TotalScore = 0) correctly", async () => {
    const tournament = makeTournament();
    const leaderboard = makeLeaderboard({
      Players: [
        {
          PlayerID: 40001,
          FirstName: "Even",
          LastName: "Par",
          Country: "USA",
          TotalScore: 0, // Even par
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
    });

    mockFetchLeaderboard.mockResolvedValue(leaderboard);

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    expect(results[0].resultsCount).toBe(1);

    // Verify the inserted data has TotalScore=0, not null
    expect(insertedResults.length).toBeGreaterThan(0);
    const firstBatch = insertedResults[0];
    expect(firstBatch[0].totalScoreToPar).toBe(0); // NOT null
  });

  it("handles empty leaderboard with no players", async () => {
    const tournament = makeTournament();
    const leaderboard = makeLeaderboard({ Players: [] });

    setupDbMock({
      tournaments: [tournament],
      golferRows: [],
    });

    mockFetchLeaderboard.mockResolvedValue(leaderboard);

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    expect(results[0].resultsCount).toBe(0);
    // Should NOT insert results when there are no players
    expect(operations).not.toContain("upsert:results");
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
    });

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    expect(mockFetchLeaderboard).not.toHaveBeenCalled();
    expect(results).toHaveLength(0);
  });

  it("captures error in results when fetchLeaderboard throws", async () => {
    const tournament = makeTournament();

    setupDbMock({
      tournaments: [tournament],
      golferRows: [],
    });

    mockFetchLeaderboard.mockRejectedValue(new Error("API rate limit"));

    const { syncResults } = await import("../sync-results");
    const results = await syncResults();

    // Error is captured in the results array (not swallowed)
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      tournament: "The Genesis Invitational",
      error: expect.stringContaining("API rate limit"),
      resultsCount: 0,
    });
  });

  it("does not use nextval or manual sequence for insert", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const source = readFileSync(
      resolve(__dirname, "../sync-results.ts"),
      "utf-8"
    );

    expect(source).not.toContain("nextval");
    expect(source).not.toContain("tournament_results_id_seq");
  });

  it("uses onConflictDoUpdate upsert instead of transactions", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const source = readFileSync(
      resolve(__dirname, "../sync-results.ts"),
      "utf-8"
    );

    // Must use Drizzle's onConflictDoUpdate (Neon HTTP driver has no transaction support)
    expect(source).toContain("onConflictDoUpdate");
    expect(source).toContain(".insert(tournamentResults)");
    expect(source).not.toContain("db.transaction");

    // Must use inArray for batch golfer lookup
    expect(source).toContain("inArray");
  });

  it("uses Math.round for numeric fields to handle decimal API values", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const source = readFileSync(
      resolve(__dirname, "../sync-results.ts"),
      "utf-8"
    );

    expect(source).toContain("Math.round(p.Rank)");
    expect(source).toContain("Math.round(p.TotalStrokes)");
    expect(source).toContain("Math.round(p.TotalScore)");
  });

  it("uses Drizzle ORM onConflictDoNothing for missing golfers", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const source = readFileSync(
      resolve(__dirname, "../sync-results.ts"),
      "utf-8"
    );

    // Uses Drizzle's typed API for golfer inserts
    expect(source).toContain("onConflictDoNothing");
    expect(source).toContain(".insert(golfers)");
  });
});
