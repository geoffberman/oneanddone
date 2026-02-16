import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { seasons, tournaments } from "./golf";

export const memberRoleEnum = pgEnum("member_role", ["manager", "player"]);

export const games = pgTable("games", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  inviteCode: text("invite_code").notNull().unique(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const gameMembers = pgTable(
  "game_members",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").default("player").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (gm) => [
    uniqueIndex("idx_game_member_unique").on(gm.gameId, gm.userId),
    index("idx_game_member_game").on(gm.gameId),
    index("idx_game_member_user").on(gm.userId),
  ]
);

export const subGames = pgTable("sub_games", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subGameTournaments = pgTable(
  "sub_game_tournaments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    subGameId: integer("sub_game_id")
      .notNull()
      .references(() => subGames.id, { onDelete: "cascade" }),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id),
  },
  (sgt) => [
    uniqueIndex("idx_subgame_tournament_unique").on(
      sgt.subGameId,
      sgt.tournamentId
    ),
  ]
);

// Relations
export const gamesRelations = relations(games, ({ one, many }) => ({
  season: one(seasons, {
    fields: [games.seasonId],
    references: [seasons.id],
  }),
  creator: one(users, {
    fields: [games.createdBy],
    references: [users.id],
  }),
  members: many(gameMembers),
  subGames: many(subGames),
}));

export const gameMembersRelations = relations(gameMembers, ({ one }) => ({
  game: one(games, {
    fields: [gameMembers.gameId],
    references: [games.id],
  }),
  user: one(users, {
    fields: [gameMembers.userId],
    references: [users.id],
  }),
}));

export const subGamesRelations = relations(subGames, ({ one, many }) => ({
  game: one(games, {
    fields: [subGames.gameId],
    references: [games.id],
  }),
  tournaments: many(subGameTournaments),
}));

export const subGameTournamentsRelations = relations(
  subGameTournaments,
  ({ one }) => ({
    subGame: one(subGames, {
      fields: [subGameTournaments.subGameId],
      references: [subGames.id],
    }),
    tournament: one(tournaments, {
      fields: [subGameTournaments.tournamentId],
      references: [tournaments.id],
    }),
  })
);
