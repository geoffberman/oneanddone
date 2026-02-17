import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { tournaments, golfers } from "./golf";
import { games } from "./game";

export const picks = pgTable(
  "picks",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id),
    primaryGolferId: integer("primary_golfer_id")
      .notNull()
      .references(() => golfers.id),
    alternateGolferId: integer("alternate_golfer_id").references(
      () => golfers.id
    ),
    activeGolferId: integer("active_golfer_id").references(() => golfers.id),
    alternateActivated: boolean("alternate_activated").default(false).notNull(),
    earnings: numeric("earnings", { precision: 12, scale: 2 }).default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (p) => [
    uniqueIndex("idx_pick_unique").on(p.gameId, p.userId, p.tournamentId),
    index("idx_pick_game").on(p.gameId),
    index("idx_pick_user").on(p.userId),
    index("idx_pick_tournament").on(p.tournamentId),
    index("idx_pick_game_user").on(p.gameId, p.userId),
  ]
);

export const usedGolfers = pgTable(
  "used_golfers",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    golferId: integer("golfer_id")
      .notNull()
      .references(() => golfers.id),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (ug) => [
    uniqueIndex("idx_used_golfer_unique").on(
      ug.gameId,
      ug.userId,
      ug.golferId
    ),
    index("idx_used_golfer_game_user").on(ug.gameId, ug.userId),
  ]
);

// Relations
export const picksRelations = relations(picks, ({ one }) => ({
  game: one(games, {
    fields: [picks.gameId],
    references: [games.id],
  }),
  user: one(users, {
    fields: [picks.userId],
    references: [users.id],
  }),
  tournament: one(tournaments, {
    fields: [picks.tournamentId],
    references: [tournaments.id],
  }),
  primaryGolfer: one(golfers, {
    fields: [picks.primaryGolferId],
    references: [golfers.id],
    relationName: "primaryGolfer",
  }),
  alternateGolfer: one(golfers, {
    fields: [picks.alternateGolferId],
    references: [golfers.id],
    relationName: "alternateGolfer",
  }),
  activeGolfer: one(golfers, {
    fields: [picks.activeGolferId],
    references: [golfers.id],
    relationName: "activeGolfer",
  }),
}));

export const usedGolfersRelations = relations(usedGolfers, ({ one }) => ({
  game: one(games, {
    fields: [usedGolfers.gameId],
    references: [games.id],
  }),
  user: one(users, {
    fields: [usedGolfers.userId],
    references: [users.id],
  }),
  golfer: one(golfers, {
    fields: [usedGolfers.golferId],
    references: [golfers.id],
  }),
  tournament: one(tournaments, {
    fields: [usedGolfers.tournamentId],
    references: [tournaments.id],
  }),
}));
