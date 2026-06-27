'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Briefcase, Link2, FileText, Monitor, BookMarked } from 'lucide-react';
import { JobList } from './JobList';
import { SeedList } from './SeedList';
import { ProfileList } from './ProfileList';
import { BrowserProfileList } from './BrowserProfileList';
import { CorrectionsList } from './CorrectionsList';
import type { ExplicitCorrectionRow } from './CorrectionsList';

// =============================================================================
// Ad-hoc row types (matching the server component shapes)
// =============================================================================

export interface ProfileMaintenanceJobRow {
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

export interface PdpSeedRow {
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

export interface SiteExtractionProfileRow {
  id: string;
  brand_id: string;
  source_slug: string;
  source_type: string;
  canonical_domain: string;
  status: string;
  active_version_id: string | null;
  profile_setup_completed_at: string | null;
  created_at: string;
  /** Joined brand name, always present via INNER JOIN */
  brands: { name: string } | null;
}

export { type ExplicitCorrectionRow } from './CorrectionsList';

export interface BrowserProfileRow {
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
  /** Joined brand name, always present via INNER JOIN */
  brands: { name: string } | null;
}

// =============================================================================
// Tab configuration
// =============================================================================

const TABS = [
  {
    id: 'jobs',
    label: 'Jobs',
    icon: Briefcase,
    description: 'Pending, running, and completed profile-maintenance jobs',
  },
  {
    id: 'seeds',
    label: 'Seeds',
    icon: Link2,
    description: 'Product detail page seeds by trust status',
  },
  {
    id: 'profiles',
    label: 'Profiles',
    icon: FileText,
    description: 'Site extraction profiles by brand and status',
  },
  {
    id: 'browser-profiles',
    label: 'Browser Profiles',
    icon: Monitor,
    description: 'Browser profile registry by status and validation',
  },
  {
    id: 'corrections',
    label: 'Corrections',
    icon: BookMarked,
    description: 'Explicit corrections ready for promotion',
  },
] as const;

type TabId = (typeof TABS)[number]['id'];

// =============================================================================
// Props
// =============================================================================

interface ProfileMaintenanceClientProps {
  initialJobs: ProfileMaintenanceJobRow[];
  initialSeeds: PdpSeedRow[];
  initialProfiles: SiteExtractionProfileRow[];
  initialBrowserProfiles: BrowserProfileRow[];
  initialCorrections?: ExplicitCorrectionRow[];
  draftVersionByProfile?: Record<string, { id: string; version_number: number }>;
  initialTab?: string;
  highlightedArtifactId?: string;
}

// =============================================================================
// Component
// =============================================================================

export function ProfileMaintenanceClient({
  initialJobs,
  initialSeeds,
  initialProfiles,
  initialBrowserProfiles,
  initialCorrections = [],
  draftVersionByProfile = {},
  initialTab = 'jobs',
  highlightedArtifactId,
}: ProfileMaintenanceClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab as TabId);
  const [search, setSearch] = useState('');

  // Derived badge counts
  const counts = useMemo(() => {
    const activeJobStatuses = ['queued', 'claimed', 'running'];
    const candidateSeeds = initialSeeds.filter((s) => s.trust_status === 'candidate');
    const draftProfiles = initialProfiles.filter((p) => p.status === 'draft' || p.status === 'needs_attention');
    const staleBrowserProfiles = initialBrowserProfiles.filter(
      (bp) => bp.status !== 'validated' || !bp.last_validated_at,
    );

    return {
      jobsActive: initialJobs.filter((j) => activeJobStatuses.includes(j.status)).length,
      seedsCandidate: candidateSeeds.length,
      profilesAttention: draftProfiles.length,
      browserProfilesAttention: staleBrowserProfiles.length,
      correctionsTotal: initialCorrections.length,
    };
  }, [initialJobs, initialSeeds, initialProfiles, initialBrowserProfiles]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar — applies contextual search per tab */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={
            activeTab === 'jobs'
              ? 'Search jobs by kind, brand, or domain...'
              : activeTab === 'seeds'
                ? 'Search seeds by URL or brand...'
                : activeTab === 'profiles'
                  ? 'Search profiles by brand or domain...'
                : activeTab === 'browser-profiles'
                  ? 'Search browser profiles by brand or domain...'
                  : 'Search corrections by field, source, or domain...'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TabId)}
        className="w-full"
      >
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto w-fit flex-nowrap gap-1 bg-transparent p-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const badgeCount =
                tab.id === 'jobs'
                  ? counts.jobsActive
                  : tab.id === 'seeds'
                    ? counts.seedsCandidate
                    : tab.id === 'profiles'
                      ? counts.profilesAttention
                      : tab.id === 'browser-profiles'
                        ? counts.browserProfilesAttention
                        : counts.correctionsTotal;

              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  title={tab.description}
                  className="flex h-auto items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors data-[state=active]:border-primary/20 data-[state=active]:bg-primary/5 data-[state=active]:text-primary"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                  {badgeCount > 0 && (
                    <Badge
                      variant={
                        tab.id === 'jobs' || tab.id === 'seeds'
                          ? 'warning'
                          : 'secondary'
                      }
                      className="ml-0.5 min-w-[1.25rem] h-3.5 justify-center px-1 py-0 text-[9px] font-bold"
                    >
                      {badgeCount}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Tab content panels */}
        <TabsContent value="jobs" className="mt-2 outline-none">
          <JobList jobs={initialJobs} search={search} />
        </TabsContent>

        <TabsContent value="seeds" className="mt-2 outline-none">
          <SeedList seeds={initialSeeds} search={search} />
        </TabsContent>

        <TabsContent value="profiles" className="mt-2 outline-none">
          <ProfileList profiles={initialProfiles} search={search} draftVersionByProfile={draftVersionByProfile} />
        </TabsContent>

        <TabsContent value="browser-profiles" className="mt-2 outline-none">
          <BrowserProfileList browserProfiles={initialBrowserProfiles} search={search} />
        </TabsContent>

        <TabsContent value="corrections" className="mt-2 outline-none">
          <CorrectionsList corrections={initialCorrections} search={search} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
