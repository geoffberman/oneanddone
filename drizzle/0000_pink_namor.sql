CREATE TYPE "public"."member_role" AS ENUM('manager', 'player');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp,
	"image" text,
	"password" text,
	"display_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "golfers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "golfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"external_player_id" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"country" text,
	"photo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "golfers_external_player_id_unique" UNIQUE("external_player_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seasons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"year" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"external_season_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "tournament_fields" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tournament_fields_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"golfer_id" integer NOT NULL,
	"is_withdrawn" boolean DEFAULT false NOT NULL,
	"withdrawn_before_round_1" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tournament_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"golfer_id" integer NOT NULL,
	"position" integer,
	"earnings" numeric(12, 2) DEFAULT '0',
	"total_score" integer,
	"total_score_to_par" integer,
	"made_cut" boolean,
	"is_withdrawn" boolean DEFAULT false,
	"rounds" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tournaments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"external_tournament_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"location" text,
	"venue" text,
	"course_name" text,
	"par" integer,
	"purse" numeric(14, 2),
	"time_zone" text,
	"first_tee_time" timestamp with time zone,
	"is_over" boolean DEFAULT false NOT NULL,
	"is_in_progress" boolean DEFAULT false NOT NULL,
	"canceled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tournaments_external_tournament_id_unique" UNIQUE("external_tournament_id")
);
--> statement-breakpoint
CREATE TABLE "game_members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "game_members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"game_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'player' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "games_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"season_id" integer NOT NULL,
	"created_by" text NOT NULL,
	"invite_code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "games_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "sub_game_tournaments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sub_game_tournaments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sub_game_id" integer NOT NULL,
	"tournament_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_games" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sub_games_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"game_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "picks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "picks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"game_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"tournament_id" integer NOT NULL,
	"primary_golfer_id" integer NOT NULL,
	"alternate_golfer_id" integer,
	"active_golfer_id" integer,
	"alternate_activated" boolean DEFAULT false NOT NULL,
	"earnings" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "used_golfers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "used_golfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"game_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"golfer_id" integer NOT NULL,
	"tournament_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_fields" ADD CONSTRAINT "tournament_fields_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_fields" ADD CONSTRAINT "tournament_fields_golfer_id_golfers_id_fk" FOREIGN KEY ("golfer_id") REFERENCES "public"."golfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_results" ADD CONSTRAINT "tournament_results_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_results" ADD CONSTRAINT "tournament_results_golfer_id_golfers_id_fk" FOREIGN KEY ("golfer_id") REFERENCES "public"."golfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_members" ADD CONSTRAINT "game_members_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_members" ADD CONSTRAINT "game_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_game_tournaments" ADD CONSTRAINT "sub_game_tournaments_sub_game_id_sub_games_id_fk" FOREIGN KEY ("sub_game_id") REFERENCES "public"."sub_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_game_tournaments" ADD CONSTRAINT "sub_game_tournaments_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_games" ADD CONSTRAINT "sub_games_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_primary_golfer_id_golfers_id_fk" FOREIGN KEY ("primary_golfer_id") REFERENCES "public"."golfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_alternate_golfer_id_golfers_id_fk" FOREIGN KEY ("alternate_golfer_id") REFERENCES "public"."golfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_active_golfer_id_golfers_id_fk" FOREIGN KEY ("active_golfer_id") REFERENCES "public"."golfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "used_golfers" ADD CONSTRAINT "used_golfers_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "used_golfers" ADD CONSTRAINT "used_golfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "used_golfers" ADD CONSTRAINT "used_golfers_golfer_id_golfers_id_fk" FOREIGN KEY ("golfer_id") REFERENCES "public"."golfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "used_golfers" ADD CONSTRAINT "used_golfers_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tournament_field_unique" ON "tournament_fields" USING btree ("tournament_id","golfer_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_field_tournament" ON "tournament_fields" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_field_golfer" ON "tournament_fields" USING btree ("golfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_result_unique" ON "tournament_results" USING btree ("tournament_id","golfer_id");--> statement-breakpoint
CREATE INDEX "idx_result_tournament" ON "tournament_results" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_tournaments_season" ON "tournaments" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "idx_tournaments_start_date" ON "tournaments" USING btree ("start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_game_member_unique" ON "game_members" USING btree ("game_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_game_member_game" ON "game_members" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_game_member_user" ON "game_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_subgame_tournament_unique" ON "sub_game_tournaments" USING btree ("sub_game_id","tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pick_unique" ON "picks" USING btree ("game_id","user_id","tournament_id");--> statement-breakpoint
CREATE INDEX "idx_pick_game" ON "picks" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_pick_user" ON "picks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pick_tournament" ON "picks" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_pick_game_user" ON "picks" USING btree ("game_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_used_golfer_unique" ON "used_golfers" USING btree ("game_id","user_id","golfer_id");--> statement-breakpoint
CREATE INDEX "idx_used_golfer_game_user" ON "used_golfers" USING btree ("game_id","user_id");