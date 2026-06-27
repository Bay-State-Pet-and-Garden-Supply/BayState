'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BrandSourceCascadeEditor } from '@/components/admin/brands/BrandSourceCascadeEditor';
import type { Brand } from '@/lib/types';
import type { PdpSeedSummary } from '@/lib/profile-maintenance/brand-source-setup-types';

interface SourceSetupData {
  hasOfficialDomain: boolean;
  siteExtractionProfile: {
    id: string | null;
    brand_source_id: string | null;
    source_slug: string;
    source_type: string;
    canonical_domain: string | null;
    status: string | null;
    active_version_id: string | null;
    profile_setup_completed_at: string | null;
  } | null;
  pdpSeeds: PdpSeedSummary[];
  cascadeReadiness: { configured: boolean; reason?: string };
}

interface BrandSourceSetupProfileStatusStepProps {
  brand: Brand;
  sourceSetup: SourceSetupData;
  onRefresh: () => Promise<void>;
}

/**
 * Step 3: Read-only summary showing overall profile setup progress.
 * Displays domain status, cascade readiness, seed summary,
 * profile status, and next-step guidance.
 */
export function BrandSourceSetupProfileStatusStep({
  brand,
  sourceSetup,
  onRefresh,
}: BrandSourceSetupProfileStatusStepProps) {
  const [showCascade, setShowCascade] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const { hasOfficialDomain, siteExtractionProfile, pdpSeeds, cascadeReadiness } =
    sourceSetup;

  const handleDraftProfile = async () => {
    if (!siteExtractionProfile?.id) return;
    setIsDrafting(true);
    try {
      const res = await fetch(
        `/api/admin/site-extraction-profiles/${siteExtractionProfile.id}/draft`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
      toast.success('AI Schema Draft job enqueued. Check profile-maintenance for results.');
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start draft');
    } finally {
      setIsDrafting(false);
    }
  };

  const verifiedCount = pdpSeeds.filter(
    (s) => s.trust_status === 'verified',
  ).length;
  const candidateCount = pdpSeeds.filter(
    (s) => s.trust_status === 'candidate',
  ).length;
  const rejectedCount = pdpSeeds.filter(
    (s) => s.trust_status === 'rejected',
  ).length;
  const profileStatus = siteExtractionProfile?.status ?? null;
  const canonicalDomain = siteExtractionProfile?.canonical_domain ?? '';

  return (
    <div className="space-y-5">
      {/* Domain status */}
      <StatusCard
        Icon={hasOfficialDomain ? CheckCircle2 : AlertCircle}
        iconColor={
          hasOfficialDomain ? 'text-brand-forest-green' : 'text-amber-500'
        }
        title={
          hasOfficialDomain ? 'Domain configured' : 'No official domain'
        }
        description={
          hasOfficialDomain
            ? canonicalDomain || 'Domain saved'
            : 'Add a domain in Step 1 to begin setup.'
        }
      />

      {/* Source cascade status */}
      <div>
        <StatusCard
          Icon={
            cascadeReadiness.configured ? CheckCircle2 : AlertCircle
          }
          iconColor={
            cascadeReadiness.configured
              ? 'text-brand-forest-green'
              : 'text-destructive'
          }
          title={
            cascadeReadiness.configured
              ? 'Source cascade configured'
              : 'Source cascade not configured'
          }
          description={
            cascadeReadiness.configured
              ? 'Ready to extract from distributors.'
              : cascadeReadiness.reason ??
                'Configure distributor sources below.'
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCascade(!showCascade)}
              className="h-7 text-[10px] font-semibold rounded-none"
            >
              {showCascade ? 'Hide cascade editor' : 'Configure cascade'}
              {showCascade ? (
                <ChevronDown className="ml-1 h-3 w-3" />
              ) : (
                <ChevronRight className="ml-1 h-3 w-3" />
              )}
            </Button>
          }
        />
        {showCascade && (
          <div className="pl-4 border-l-2 border-border ml-2 mt-2">
            <BrandSourceCascadeEditor
              brandId={brand.id}
              brandSlug={brand.slug}
              onSave={onRefresh}
            />
          </div>
        )}
      </div>

      {/* PDP seeds summary */}
      <StatusCard
        Icon={
          verifiedCount > 0
            ? CheckCircle2
            : pdpSeeds.length > 0
              ? Clock
              : AlertCircle
        }
        iconColor={
          verifiedCount > 0
            ? 'text-brand-forest-green'
            : 'text-muted-foreground'
        }
        title={`PDP Seeds: ${verifiedCount} verified, ${candidateCount} pending, ${rejectedCount} rejected`}
        description={
          verifiedCount > 0
            ? 'Verified seeds ready for profile generation.'
            : pdpSeeds.length > 0
              ? 'Seeds pending verification. Check back after jobs complete.'
              : 'Add PDP seed URLs in Step 2.'
        }
      />

      {/* Site extraction profile status */}
      <StatusCard
        Icon={
          profileStatus === 'active'
            ? CheckCircle2
            : profileStatus
              ? Clock
              : AlertCircle
        }
        iconColor={
          profileStatus === 'active'
            ? 'text-brand-forest-green'
            : profileStatus
              ? 'text-amber-500'
              : 'text-muted-foreground'
        }
        title={`Profile status: ${profileStatus ?? 'not started'}`}
        description={
          profileStatus === 'active'
            ? 'Extraction profile is active with approved version.'
            : profileStatus === 'draft'
              ? 'AI draft generated. Validate and approve to activate for extraction.'
              : profileStatus === 'needs_attention'
                ? 'Profile needs attention — check seeds and cascade config.'
                : 'No profile yet. Complete Steps 1 and 2 to establish a profile.'
        }
      />

      {/* Draft Profile button — only when verified seeds exist and no draft yet */}
      {verifiedCount > 0 && siteExtractionProfile?.id && profileStatus !== 'active' && profileStatus !== 'draft' && (
        <Button
          onClick={() => void handleDraftProfile()}
          disabled={isDrafting}
          className="w-full rounded-none text-xs font-semibold bg-brand-forest-green hover:bg-brand-forest-green/90 text-white"
        >
          {isDrafting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {isDrafting ? 'Enqueuing draft...' : 'Draft AI Extraction Profile'}
        </Button>
      )}

      {/* Post-draft actions: Validate & Approve */}
      {profileStatus === 'draft' && siteExtractionProfile?.id && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Draft complete. Go to{' '}
            <a href="/admin/profile-maintenance?tab=profiles" className="font-semibold text-brand-forest-green hover:underline">
              Profile Maintenance
            </a>{' '}
            to validate and approve this version for extraction.
          </p>
        </div>
      )}

      {/* What's next guidance */}
      <div className="mt-6 p-4 border border-border bg-muted/30">
        <h4 className="text-xs font-bold uppercase tracking-widest text-foreground mb-3">
          What&rsquo;s next
        </h4>
        <ul className="space-y-2 text-xs text-muted-foreground">
          {!hasOfficialDomain && (
            <li className="flex items-center gap-2">
              <span className="text-foreground">→</span>
              Save an official domain (Step 1)
            </li>
          )}
          {hasOfficialDomain && !cascadeReadiness.configured && (
            <li className="flex items-center gap-2">
              <span className="text-foreground">→</span>
              Configure source cascade
            </li>
          )}
          {hasOfficialDomain && verifiedCount === 0 && (
            <li className="flex items-center gap-2">
              <span className="text-foreground">→</span>
              Add and verify PDP seeds (Step 2)
            </li>
          )}
          {verifiedCount > 0 && profileStatus !== 'active' && profileStatus !== 'draft' && (
            <li className="flex items-center gap-2">
              <span className="text-foreground">→</span>
              Draft an AI extraction profile from your verified PDP seeds
            </li>
          )}
          {profileStatus === 'draft' && (
            <li className="flex items-center gap-2">
              <span className="text-foreground">→</span>
              Go to{' '}
              <a href="/admin/profile-maintenance?tab=profiles" className="font-semibold text-brand-forest-green hover:underline">
                Profile Maintenance
              </a>{' '}
              to Validate → Approve → activate for extraction
            </li>
          )}
          {profileStatus === 'active' && (
            <li className="flex items-center gap-2 text-brand-forest-green">
              <CheckCircle2 className="h-3 w-3" />
              All set! Enrichment will use active profile.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

// =============================================================================
// StatusCard helper
// =============================================================================

function StatusCard({
  Icon,
  iconColor,
  title,
  description,
  action,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 p-3 border border-border bg-card">
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
