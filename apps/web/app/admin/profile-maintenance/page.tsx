import { Metadata } from 'next';
import { Layers } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { ProfileMaintenanceClient } from '@/components/admin/profile-maintenance/ProfileMaintenanceClient';
import { createAdminClient } from '@/lib/supabase/server';
import type { ExplicitCorrectionRow } from '@/components/admin/profile-maintenance/CorrectionsList';

export const metadata: Metadata = {
  title: 'Profile Maintenance | Admin | Bay State Pet & Garden',
  description: 'Queue view for site extraction profile maintenance — jobs, PDP seeds, profiles, and browser profiles.',
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Ad-hoc row shapes returned by Supabase (no Zod/zod validation needed for a read-only queue view).
 * These match the tables defined in the profile-maintenance migrations.
 */
interface ProfileMaintenanceJobRow {
  id: string;
  kind: string;
  status: string;
  brand_id: string | null;
  source_slug: string | null;
  canonical_domain: string | null;
  profile_id: string | null;
  browser_profile_id: string | null;
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface PdpSeedRow {
  id: string;
  url: string;
  normalized_url: string;
  trust_status: string;
  brand_id: string;
  source_slug: string;
  canonical_domain: string;
  verified_at: string | null;
  created_at: string;
  verification_artifact_id: string | null;
}

interface SiteExtractionProfileRow {
  id: string;
  brand_id: string;
  source_slug: string;
  source_type: string;
  canonical_domain: string;
  status: string;
  active_version_id: string | null;
  profile_setup_completed_at: string | null;
  created_at: string;
  brands: { name: string } | null;
}

interface BrowserProfileRow {
  id: string;
  brand_id: string;
  source_slug: string;
  canonical_domain: string;
  status: string;
  required: boolean;
  environment: string;
  runner_name: string | null;
  last_validated_at: string | null;
  created_at: string;
  brands: { name: string } | null;
}

export default async function ProfileMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; id?: string }>;
}) {
  const { tab, id } = await searchParams;
  const supabase = await createAdminClient();

  // Fetch all four data sets in parallel
  const [
    jobsResult,
    seedsResult,
    profilesResult,
    browserProfilesResult,
    correctionsResult,
    versionsResult,
  ] = await Promise.all([
    supabase
      .from('profile_maintenance_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('product_detail_page_seeds')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('site_extraction_profiles')
      .select('*, brands!inner(name)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('browser_profiles')
      .select('*, brands!inner(name)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('explicit_extraction_corrections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('site_extraction_profile_versions')
      .select('id, profile_id, version_number, status')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const jobs = (jobsResult.data ?? []) as ProfileMaintenanceJobRow[];
  const seeds = (seedsResult.data ?? []) as PdpSeedRow[];
  const profiles = (profilesResult.data ?? []) as SiteExtractionProfileRow[];
  const browserProfiles = (browserProfilesResult.data ?? []) as BrowserProfileRow[];
  const corrections = (correctionsResult.data ?? []) as ExplicitCorrectionRow[];

  // Map profile_id → latest draft version
  const draftVersionByProfile: Record<string, { id: string; version_number: number }> = {};
  for (const v of (versionsResult?.data ?? []) as Array<{ id: string; profile_id: string; version_number: number; status: string }>) {
    if (!draftVersionByProfile[v.profile_id]) {
      draftVersionByProfile[v.profile_id] = { id: v.id, version_number: v.version_number };
    }
  }

  return (
    <AdminPageShell
      title="Profile Maintenance"
      description="Cross-brand queue view for site extraction profile setup, verification, browser profiles, and explicit corrections."
      icon={<Layers className="h-5 w-5" />}
      eyebrow="Queue view"
    >
      <ProfileMaintenanceClient
        initialJobs={jobs}
        initialSeeds={seeds}
        initialProfiles={profiles}
        initialBrowserProfiles={browserProfiles}
        initialCorrections={corrections}
        draftVersionByProfile={draftVersionByProfile}
        initialTab={tab}
        highlightedArtifactId={id}
      />
    </AdminPageShell>
  );
}
