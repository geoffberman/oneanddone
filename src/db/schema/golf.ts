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

export const seasons = pgTable("seasons", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  year: integer("year").notNull().unique(),
  name: text("name").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  externalSeasonId: integer("external_season_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tournaments = pgTable(
  "tournaments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    externalTournamentId: integer("external_tournament_id").notNull().unique(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    name: text("name").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    location: text("location"),
    venue: text("venue"),
    courseName: text("course_name"),
    par: integer("par"),
    purse: numeric("purse", { precision: 14, scale: 2 }),
    timeZone: text("time_zone"),
    firstTeeTime: timestamp("first_tee_time", { withTimezone: true }),
    isOver: boolean("is_over").default(false).notNull(),
    isInProgress: boolean("is_in_progress").default(false).notNull(),
    canceled: boolean("canceled").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_tournaments_season").on(t.seasonId),
    index("idx_tournaments_start_date").on(t.startDate),
  ]
);

export const golfers = pgTable("golfers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  externalPlayerId: integer("external_player_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  country: text("country"),
  photoUrl: text("photo_url"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tournamentFields = pgTable(
  "tournament_fields",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id),
    golferId: integer("golfer_id")
      .notNull()
      .references(() => golfers.id),
    isWithdrawn: boolean("is_withdrawn").default(false).notNull(),
    withdrawnBeforeRound1: boolean("withdrawn_before_round_1")
      .default(false)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (tf) => [
    uniqueIndex("idx_tournament_field_unique").on(
      tf.tournamentId,
      tf.golferId
    ),
    index("idx_tournament_field_tournament").on(tf.tournamentId),
    index("idx_tournament_field_golfer").on(tf.golferId),
  ]
);

export const tournamentResults = pgTable(
  "tournament_results",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id),
    golferId: integer("golfer_id")
      .notNull()
      .references(() => golfers.id),
    position: integer("position"),
    earnings: numeric("earnings", { precision: 12, scale: 2 }).default("0"),
    totalScore: integer("total_score"),
    totalScoreToPar: integer("total_score_to_par"),
    madeCut: boolean("made_cut"),
    isWithdrawn: boolean("is_withdrawn").default(false),
    rounds: integer("rounds"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (tr) => [
    uniqueIndex("idx_result_unique").on(tr.tournamentId, tr.golferId),
    index("idx_result_tournament").on(tr.tournamentId),
  ]
);

// Relations
export const seasonsRelations = relations(seasons, ({ many }) => ({
  tournaments: many(tournaments),
}));

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
  season: one(seasons, {
    fields: [tournaments.seasonId],
    references: [seasons.id],
  }),
  fields: many(tournamentFields),
  results: many(tournamentResults),
}));

export const golfersRelations = relations(golfers, ({ many }) => ({
  tournamentFields: many(tournamentFields),
  tournamentResults: many(tournamentResults),
}));

export const tournamentFieldsRelations = relations(
  tournamentFields,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentFields.tournamentId],
      references: [tournaments.id],
    }),
    golfer: one(golfers, {
      fields: [tournamentFields.golferId],
      references: [golfers.id],
    }),
  })
);

export const tournamentResultsRelations = relations(
  tournamentResults,
  ({ one }) => ({
    tournament: one(tournaments, {
      fields: [tournamentResults.tournamentId],
      references: [tournaments.id],
    }),
    golfer: one(golfers, {
      fields: [tournamentResults.golferId],
      references: [golfers.id],
    }),
  })
);
