export const OFFICIAL_BRAND_SELECTION_STATUSES = [
  "candidate",
  "selected",
  "rejected",
  "extracted",
  "failed",
] as const;

export type OfficialBrandSelectionStatus =
  (typeof OFFICIAL_BRAND_SELECTION_STATUSES)[number];

const OFFICIAL_BRAND_CANDIDATE_SOURCES = ["serper", "manual"] as const;

export type OfficialBrandCandidateSource =
  (typeof OFFICIAL_BRAND_CANDIDATE_SOURCES)[number];

export interface OfficialBrandCandidateReviewItem {
  id: string;
  sku: string;
  url: string;
  normalized_url: string;
  normalized_domain: string;
  selection_status: OfficialBrandSelectionStatus;
  selection_tier: string | null;
  composite_score: number | null;
  confidence: number | null;
  rank: number | null;
  title: string | null;
  snippet: string | null;
  candidate_source: OfficialBrandCandidateSource;
  appeared_in_phases: number[] | null;
  discovery_job_id: string | null;
  extraction_job_id: string | null;
  error_message: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface OfficialBrandSkuReview {
  sku: string;
  product_name: string | null;
  register_name: string | null;
  predicted_name: string | null;
  cohort_id: string;
  candidates: OfficialBrandCandidateReviewItem[];
  selected_url: string | null;
  candidate_count: number;
  has_been_reviewed: boolean;
}

export interface OfficialBrandReviewCohort {
  id: string;
  name: string | null;
  brand_name: string;
  official_domains: string[];
  preferred_domains: string[];
}

export interface OfficialBrandReviewSummary {
  total_skus: number;
  skus_with_selection: number;
  skus_without_candidates: number;
  skus_reviewed: number;
  skus_extracted: number;
}

export interface CandidatesBySkuResponse {
  skus: OfficialBrandSkuReview[];
  cohort: OfficialBrandReviewCohort;
  summary: OfficialBrandReviewSummary;
}
