-- Restore scraper_runners table if it was dropped
CREATE TABLE IF NOT EXISTS "public"."scraper_runners" (
    "name" "text" NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "status" "text",
    "current_job_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "auth_user_id" "uuid",
    "last_auth_at" timestamp with time zone,
    "jobs_completed" integer DEFAULT 0,
    "memory_usage_mb" integer,
    "enabled" boolean DEFAULT true NOT NULL,
    CONSTRAINT "scraper_runners_status_check" CHECK (("status" = ANY (ARRAY['online'::"text", 'offline'::"text", 'busy'::"text", 'idle'::"text", 'polling'::"text", 'paused'::"text"]))),
    CONSTRAINT "scraper_runners_pkey" PRIMARY KEY ("name")
);

-- Restore runner_api_keys table if it was dropped
CREATE TABLE IF NOT EXISTS "public"."runner_api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "runner_name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid",
    "allowed_scrapers" "text"[],
    CONSTRAINT "runner_api_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "runner_api_keys_runner_name_fkey" FOREIGN KEY ("runner_name") REFERENCES "public"."scraper_runners"("name") ON DELETE CASCADE
);

-- Ensure RLS is enabled
ALTER TABLE "public"."scraper_runners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."runner_api_keys" ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for staff/admin to manage scraper runners
-- Drop first to avoid errors if they already exist (though table drop should have cleared them)
DROP POLICY IF EXISTS "Staff can manage scraper runners" ON "public"."scraper_runners";
CREATE POLICY "Staff can manage scraper runners" ON "public"."scraper_runners"
FOR ALL
USING ("public"."is_staff"())
WITH CHECK ("public"."is_staff"());

-- Add RLS policies for staff/admin to manage runner API keys
DROP POLICY IF EXISTS "Staff can manage runner api keys" ON "public"."runner_api_keys";
CREATE POLICY "Staff can manage runner api keys" ON "public"."runner_api_keys"
FOR ALL
USING ("public"."is_staff"())
WITH CHECK ("public"."is_staff"());

-- Also add basic read policies for authenticated users if missing
DROP POLICY IF EXISTS "Authenticated users can read runners" ON "public"."scraper_runners";
CREATE POLICY "Authenticated users can read runners" ON "public"."scraper_runners" FOR SELECT TO "authenticated" USING (true);

DROP POLICY IF EXISTS "Authenticated users can read keys" ON "public"."runner_api_keys";
CREATE POLICY "Authenticated users can read keys" ON "public"."runner_api_keys" FOR SELECT TO "authenticated" USING (true);
