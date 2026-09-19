CREATE TYPE "public"."tracking_status" AS ENUM('tracked', 'partial', 'untracked');--> statement-breakpoint
CREATE TYPE "public"."weight_source" AS ENUM('manual', 'shortcut');--> statement-breakpoint
CREATE TABLE "daily_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"date" date NOT NULL,
	"weight_kg" numeric(5, 2),
	"weight_time" timestamp with time zone,
	"weight_source" "weight_source",
	"calories_kcal" integer,
	"protein_g" numeric(6, 1),
	"carbs_g" numeric(6, 1),
	"fat_g" numeric(6, 1),
	"sodium_mg" integer,
	"steps" integer,
	"tracking_status" "tracking_status" DEFAULT 'untracked' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_logs_owner_date_unique" UNIQUE("owner_id","date")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"height_cm" numeric(5, 1),
	"week_starts_on" smallint DEFAULT 0 NOT NULL,
	"time_zone" text DEFAULT 'Australia/Melbourne' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_logs_owner_date_idx" ON "daily_logs" USING btree ("owner_id","date");--> statement-breakpoint
-- Row level security, enabled with no policies at all.
--
-- Supabase publishes the `public` schema over PostgREST to the publishable
-- key, and that key ships inside every browser bundle. Enabling RLS without
-- writing a single policy denies that path outright: no policy means no row
-- matches, for every role subject to RLS. The table owner is exempt, and the
-- table owner is the role this application connects as through the pooler, so
-- the app keeps working and the public REST path returns nothing.
--
-- This is one of two layers. Every query in the app also filters by owner.
-- Removing either one exposes every person's body data to any signed-in user,
-- so neither is redundant.
--
-- Deliberately in the same migration as the CREATE TABLE above: split across
-- two files, a failure between them leaves the tables live and unprotected.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_logs" ENABLE ROW LEVEL SECURITY;
