-- Migration: Enforce default confidence scores for brand url candidates and enrichment targets
ALTER TABLE public.official_brand_url_candidates ALTER COLUMN confidence SET DEFAULT 0.85;
ALTER TABLE public.enrichment_targets ALTER COLUMN confidence SET DEFAULT 0.85;
