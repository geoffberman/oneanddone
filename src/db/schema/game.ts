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
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull(),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  inviteCode: text("invite_code").notNull().unique(),
  rules: text("rules"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const gameMembers = pgTable(
  "game_members",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
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
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
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
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
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

export const announcements = pgTable(
  "announcements",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    message: text("message").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (a) => [index("idx_announcement_game").on(a.gameId)]
);

export const customLeaderboards = pgTable(
  "custom_leaderboards",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (cl) => [
    index("idx_custom_lb_game").on(cl.gameId),
    index("idx_custom_lb_owner").on(cl.ownerId),
  ]
);

export const customLeaderboardMembers = pgTable(
  "custom_leaderboard_members",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    customLeaderboardId: integer("custom_leaderboard_id")
      .notNull()
      .references(() => customLeaderboards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (clm) => [
    uniqueIndex("idx_custom_lb_member_unique").on(
      clm.customLeaderboardId,
      clm.userId
    ),
  ]
);

export const customLeaderboardShares = pgTable(
  "custom_leaderboard_shares",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    customLeaderboardId: integer("custom_leaderboard_id")
      .notNull()
      .references(() => customLeaderboards.id, { onDelete: "cascade" }),
    sharedWithUserId: text("shared_with_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (cls) => [
    uniqueIndex("idx_custom_lb_share_unique").on(
      cls.customLeaderboardId,
      cls.sharedWithUserId
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
  announcements: many(announcements),
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

export const announcementsRelations = relations(announcements, ({ one }) => ({
  game: one(games, {
    fields: [announcements.gameId],
    references: [games.id],
  }),
  author: one(users, {
    fields: [announcements.authorId],
    references: [users.id],
  }),
}));

export const customLeaderboardsRelations = relations(
  customLeaderboards,
  ({ one, many }) => ({
    game: one(games, {
      fields: [customLeaderboards.gameId],
      references: [games.id],
    }),
    owner: one(users, {
      fields: [customLeaderboards.ownerId],
      references: [users.id],
    }),
    members: many(customLeaderboardMembers),
    shares: many(customLeaderboardShares),
  })
);

export const customLeaderboardMembersRelations = relations(
  customLeaderboardMembers,
  ({ one }) => ({
    leaderboard: one(customLeaderboards, {
      fields: [customLeaderboardMembers.customLeaderboardId],
      references: [customLeaderboards.id],
    }),
    user: one(users, {
      fields: [customLeaderboardMembers.userId],
      references: [users.id],
    }),
  })
);

export const customLeaderboardSharesRelations = relations(
  customLeaderboardShares,
  ({ one }) => ({
    leaderboard: one(customLeaderboards, {
      fields: [customLeaderboardShares.customLeaderboardId],
      references: [customLeaderboards.id],
    }),
    sharedWith: one(users, {
      fields: [customLeaderboardShares.sharedWithUserId],
      references: [users.id],
    }),
  })
);
