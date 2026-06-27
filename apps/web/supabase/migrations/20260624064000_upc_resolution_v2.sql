-- =============================================================================
-- UPC Resolution V2 — additive migration
-- =============================================================================
-- Adds product-level UPC resolution fields to products_ingestion and a
-- upc_resolution_events event log table. All changes are additive/IF NOT EXISTS;
-- no backfill or behavior change. Feature-flagged via job.config.upc_resolution_policy or
-- job.config.upc_resolution_v2 — when absent, legacy behavior is preserved.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add UPC resolution columns to products_ingestion
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."products_ingestion"
  ADD COLUMN IF NOT EXISTS "upc_resolution_status" "text";

ALTER TABLE "public"."products_ingestion"
  ADD COLUMN IF NOT EXISTS "upc_resolution_stage" "text";

ALTER TABLE "public"."products_ingestion"
  ADD COLUMN IF NOT EXISTS "upc_resolution_confidence" numeric;

ALTER TABLE "public"."products_ingestion"
  ADD COLUMN IF NOT EXISTS "upc_resolution_evidence" "jsonb" NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "public"."products_ingestion"
  ADD COLUMN IF NOT EXISTS "upc_resolution_updated_at" timestamp with time zone;

ALTER TABLE "public"."products_ingestion"
  ADD COLUMN IF NOT EXISTS "upc_resolution_resolved_by" "uuid";

-- ---------------------------------------------------------------------------
-- 2. Constraints and checks on new columns
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."products_ingestion"
  DROP CONSTRAINT IF EXISTS "products_ingestion_upc_resolution_status_check";

ALTER TABLE "public"."products_ingestion"
  ADD CONSTRAINT "products_ingestion_upc_resolution_status_check"
  CHECK (("upc_resolution_status" = ANY (ARRAY[
    'unresolved'::"text",
    'candidate'::"text",
    'confirmed'::"text",
    'conflict'::"text",
    'manual_override'::"text",
    'private_label'::"text"
  ])));

ALTER TABLE "public"."products_ingestion"
  DROP CONSTRAINT IF EXISTS "products_ingestion_upc_resolution_confidence_check";

ALTER TABLE "public"."products_ingestion"
  ADD CONSTRAINT "products_ingestion_upc_resolution_confidence_check"
  CHECK (("upc_resolution_confidence" IS NULL)
    OR (("upc_resolution_confidence" >= (0)::numeric)
        AND ("upc_resolution_confidence" <= (1)::numeric)));

-- ---------------------------------------------------------------------------
-- 3. Index on upc_resolution_status for admin filtering
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_products_ingestion_upc_resolution_status"
  ON "public"."products_ingestion" ("upc_resolution_status");

-- ---------------------------------------------------------------------------
-- 4. Create upc_resolution_events table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."upc_resolution_events" (
    "id"                "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "upc"               "text" NOT NULL,
    "stage"             "text",
    "source_slug"       "text",
    "outcome"           "text",
    "confidence"        numeric,
    "evidence"          "jsonb" NOT NULL DEFAULT '[]'::jsonb,
    "source_attempt_id" "uuid",                             -- FK to enrichment_source_attempts.id
    "packaging_extraction_id" "uuid",                       -- FK to product_packaging_extractions.id
    "created_at"        timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "upc_resolution_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "upc_resolution_events_outcome_check"
      CHECK (("outcome" = ANY (ARRAY[
        'found'::"text",
        'not_stocked'::"text",
        'source_error'::"text",
        'skipped'::"text"
      ])))
);

ALTER TABLE "public"."upc_resolution_events" OWNER TO "postgres";

-- ---------------------------------------------------------------------------
-- 5. Indexes on upc_resolution_events
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_upc_resolution_events_upc_created"
  ON "public"."upc_resolution_events" ("upc", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_upc_resolution_events_outcome"
  ON "public"."upc_resolution_events" ("outcome");

CREATE INDEX IF NOT EXISTS "idx_upc_resolution_events_source_slug"
  ON "public"."upc_resolution_events" ("source_slug");

-- ---------------------------------------------------------------------------
-- 6. Comments
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN "public"."products_ingestion"."upc_resolution_status"
  IS 'UPC resolution proof status: unresolved, candidate, confirmed, conflict, manual_override, private_label.';

COMMENT ON COLUMN "public"."products_ingestion"."upc_resolution_stage"
  IS 'Last resolution stage identifier (e.g. distributor, official_brand, serp, manual).';

COMMENT ON COLUMN "public"."products_ingestion"."upc_resolution_confidence"
  IS 'Overall confidence in UPC proof (0.0-1.0). NULL when no proof attempted.';

COMMENT ON COLUMN "public"."products_ingestion"."upc_resolution_evidence"
  IS 'Array of UpcResolutionEvidence objects — every source result that contributed to the resolution decision.';

COMMENT ON COLUMN "public"."products_ingestion"."upc_resolution_updated_at"
  IS 'When the UPC resolution state was last updated.';

COMMENT ON COLUMN "public"."products_ingestion"."upc_resolution_resolved_by"
  IS 'Admin user UUID who manually resolved the UPC (FK to auth.users). NULL for automated resolutions.';

COMMENT ON TABLE "public"."upc_resolution_events"
  IS 'Event log for UPC resolution lifecycle. One row per source attempt outcome in V2 mode, plus manual admin actions.';

COMMENT ON COLUMN "public"."upc_resolution_events"."upc"
  IS 'Product UPC this event relates to.';

COMMENT ON COLUMN "public"."upc_resolution_events"."stage"
  IS 'Resolution stage identifier (e.g. distributor, official_brand, licensed, serp, vlm_packaging, manual).';

COMMENT ON COLUMN "public"."upc_resolution_events"."source_slug"
  IS 'Source slug that produced this outcome (e.g. phillips, fromm). NULL for admin actions.';

COMMENT ON COLUMN "public"."upc_resolution_events"."outcome"
  IS 'Source outcome: found, not_stocked, source_error, or skipped. Matches ADR 0002 outcome set.';

COMMENT ON COLUMN "public"."upc_resolution_events"."confidence"
  IS 'Confidence in this specific outcome/evidence (0.0-1.0). NULL for skipped outcomes.';

COMMENT ON COLUMN "public"."upc_resolution_events"."evidence"
  IS 'Array of UpcResolutionEvidence objects for this event.';

COMMENT ON COLUMN "public"."upc_resolution_events"."source_attempt_id"
  IS 'FK to enrichment_source_attempts.id when this event originated from a source cascade attempt.';

COMMENT ON COLUMN "public"."upc_resolution_events"."packaging_extraction_id"
  IS 'FK to product_packaging_extractions.id when this event originated from packaging VLM/UPC extraction.';
