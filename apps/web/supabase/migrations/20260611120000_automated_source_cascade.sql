-- =============================================================================
-- Automated Source Cascade Migration
-- =============================================================================
-- Adds:
--   1. `needs_attention` to pipeline_status_five enum
--   2. `source_cascade_configured_at` and `source_cascade_configured_by` to brands
--   3. `enrichment_source_attempts` table for per-source outcome tracking
--   4. Fixes `brand_sources.search_mode` constraint to allow `upc_search`
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add `needs_attention` to the pipeline status enum
-- ---------------------------------------------------------------------------
ALTER TYPE "public"."pipeline_status_five" ADD VALUE IF NOT EXISTS 'needs_attention';

-- ---------------------------------------------------------------------------
-- 2. Add Source Cascade readiness columns to brands
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."brands"
  ADD COLUMN IF NOT EXISTS "source_cascade_configured_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "source_cascade_configured_by" "uuid";

COMMENT ON COLUMN "public"."brands"."source_cascade_configured_at"
  IS 'When the brand source cascade was last configured (NULL = not configured, extraction blocked).';
COMMENT ON COLUMN "public"."brands"."source_cascade_configured_by"
  IS 'Admin user who configured the cascade (FK to auth.users).';

-- ---------------------------------------------------------------------------
-- 3. Fix brand_sources search_mode constraint to accept `upc_search`
--    (TypeScript code already writes this value; the DB constraint was stale.)
--    Keep `sku_search` for backward compatibility with existing rows.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."brand_sources"
  DROP CONSTRAINT IF EXISTS "brand_sources_search_mode_check";

UPDATE "public"."brand_sources"
  SET "search_mode" = 'upc_search'
  WHERE "search_mode" = 'sku_search';

ALTER TABLE "public"."brand_sources"
  ADD CONSTRAINT "brand_sources_search_mode_check"
  CHECK (("search_mode" = ANY (ARRAY[
    'upc_search'::"text",
    'sku_search'::"text",
    'domain_search'::"text",
    'direct_url'::"text",
    'feed_lookup'::"text"
  ])));

-- ---------------------------------------------------------------------------
-- 4. Create enrichment_source_attempts table
--     Tracks per-source outcomes for every extraction run.
--     One row per (attempt, source) pair.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."enrichment_source_attempts" (
    "id"             "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id"         "uuid" NOT NULL,
    "attempt_id"     "uuid",                         -- FK to enrichment_attempts.id (nullable for legacy)
    "upc"            "text" NOT NULL,
    "brand_id"       "uuid",                         -- FK to brands.id (denormalized for fast lookup)
    "source_type"    "text" NOT NULL,                -- official_brand | distributor | internal | licensed_feed
    "source_slug"    "text" NOT NULL,                -- e.g. "phillips", "fromm"
    "display_name"   "text",                         -- human-readable label at time of attempt
    "priority"       integer DEFAULT 100 NOT NULL,   -- position in the cascade at time of attempt
    "outcome"        "text" NOT NULL,                -- found | not_stocked | source_error | skipped
    "confidence"     numeric,                        -- overall confidence (0.0-1.0) when found
    "matched_fields" "text"[],                       -- fields this source contributed
    "evidence_url"   "text",                         -- URL of the product page if found
    "error_code"     "text",                         -- machine-readable error code (e.g. "auth_expired")
    "error_message"  "text",                         -- human-readable error detail
    "raw_result"     "jsonb",                        -- optional: raw result payload for debugging
    "attempted_at"   timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at"     timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at"     timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "enrichment_source_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enrichment_source_attempts_outcome_check"
      CHECK (("outcome" = ANY (ARRAY[
        'found'::"text",
        'not_stocked'::"text",
        'source_error'::"text",
        'skipped'::"text"
      ])))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS "idx_source_attempts_upc_source_attempted"
  ON "public"."enrichment_source_attempts" ("upc", "source_slug", "attempted_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_source_attempts_job_upc"
  ON "public"."enrichment_source_attempts" ("job_id", "upc");

CREATE INDEX IF NOT EXISTS "idx_source_attempts_outcome"
  ON "public"."enrichment_source_attempts" ("outcome");

CREATE INDEX IF NOT EXISTS "idx_source_attempts_brand_source"
  ON "public"."enrichment_source_attempts" ("brand_id", "source_slug");

ALTER TABLE "public"."enrichment_source_attempts" OWNER TO "postgres";

-- ---------------------------------------------------------------------------
-- 5. RLS: Staff can manage enrichment source attempts
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."enrichment_source_attempts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage enrichment source attempts"
  ON "public"."enrichment_source_attempts"
  USING ("public"."is_staff"())
  WITH CHECK ("public"."is_staff"());

-- ---------------------------------------------------------------------------
-- 6. Update products_ingestion pipeline_status comment
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN "public"."products_ingestion"."pipeline_status"
  IS 'Canonical workflow state: imported, awaiting_brand, extracting, processed, merging, reviewing, publishing, needs_attention, or failed.';
