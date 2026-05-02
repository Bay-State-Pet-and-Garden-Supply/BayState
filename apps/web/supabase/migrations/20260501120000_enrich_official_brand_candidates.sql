-- Enrich official_brand_url_candidates with predicted_name, appeared_in_phases,
-- selection_tier, and composite_score columns for the two-phase URL discovery pipeline.
--
-- Phase 1.5 (LLM name consolidation) writes predicted_name.
-- Phase 3 (tiered ranking) writes selection_tier, composite_score.
-- Phases 1 and 2 each append to appeared_in_phases.
--
-- Rollback (emergency revert):
--   ALTER TABLE public.official_brand_url_candidates
--     DROP COLUMN IF EXISTS predicted_name,
--     DROP COLUMN IF EXISTS appeared_in_phases,
--     DROP COLUMN IF EXISTS selection_tier,
--     DROP COLUMN IF EXISTS composite_score;

ALTER TABLE public.official_brand_url_candidates
  ADD COLUMN IF NOT EXISTS predicted_name text,
  ADD COLUMN IF NOT EXISTS appeared_in_phases integer[],
  ADD COLUMN IF NOT EXISTS selection_tier text,
  ADD COLUMN IF NOT EXISTS composite_score numeric;

COMMENT ON COLUMN public.official_brand_url_candidates.predicted_name IS 'LLM-consolidated full product name from Phase 1.5';
COMMENT ON COLUMN public.official_brand_url_candidates.appeared_in_phases IS 'Which discovery phases produced this candidate (1, 2, or both)';
COMMENT ON COLUMN public.official_brand_url_candidates.selection_tier IS 'Ranking tier: official_domain, preferred_domain, knowledge_graph, llm_scored, organic';
COMMENT ON COLUMN public.official_brand_url_candidates.composite_score IS 'Normalized composite relevance score from Phase 3 ranking';
