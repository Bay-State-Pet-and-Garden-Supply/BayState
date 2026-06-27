/**
 * Client-side types for the Brand Source Setup API (admin).
 *
 * These types match the GET /api/admin/brands/[id]/source-setup response
 * shape and are used by the BrandSourceSetupDrawer components.
 */

export interface BrandSourceSetupResponse {
  brand: BrandSummary;
  sourceSetup: {
    hasOfficialDomain: boolean;
    siteExtractionProfile: SiteExtractionProfileSummary | null;
    pdpSeeds: PdpSeedSummary[];
    cascadeReadiness: { configured: boolean; reason?: string };
  };
}

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  official_domains: string[];
  preferred_domains: string[];
}

export interface SiteExtractionProfileSummary {
  id: string | null;
  brand_source_id: string | null;
  source_slug: string;
  source_type: string;
  canonical_domain: string | null;
  status: string | null;
  active_version_id: string | null;
  profile_setup_completed_at: string | null;
}

export interface PdpSeedSummary {
  id: string;
  url: string;
  normalized_url: string;
  trust_status: 'candidate' | 'verified' | 'rejected' | 'expired';
  verification_artifact_id: string | null;
  created_at: string;
}

export type PdpSeedVariant = 'verified' | 'candidate' | 'checking' | 'rejected' | 'expired';
