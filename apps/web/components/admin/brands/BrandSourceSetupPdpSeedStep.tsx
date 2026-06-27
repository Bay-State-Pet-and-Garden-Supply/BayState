'use client';

import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PdpSeedSummary, PdpSeedVariant } from '@/lib/profile-maintenance/brand-source-setup-types';

const TERMINAL_STATUSES = new Set([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
]);

interface BrandSourceSetupPdpSeedStepProps {
  brandId: string;
  brandSlug?: string;
  canonicalDomain: string;
  pdpSeeds: PdpSeedSummary[];
  onSeedsChanged: () => Promise<void>;
  onNext?: () => void;
}

const SEED_CARD_CONFIG: Record<
  PdpSeedVariant,
  {
    Icon: React.ComponentType<{ className?: string }>;
    color: string;
    badge: string;
    badgeClass: string;
    subtitle: string;
  }
> = {
  verified: {
    Icon: CheckCircle2,
    color: 'text-brand-forest-green',
    badge: 'Verified',
    badgeClass:
      'bg-brand-forest-green/10 text-brand-forest-green border-brand-forest-green',
    subtitle: 'Verified PDP',
  },
  candidate: {
    Icon: Clock,
    color: 'text-muted-foreground',
    badge: 'Pending',
    badgeClass: '',
    subtitle: 'Awaiting verification',
  },
  checking: {
    Icon: Loader2,
    color: 'text-blue-500 animate-spin',
    badge: 'Checking',
    badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    subtitle: 'Verifying...',
  },
  rejected: {
    Icon: XCircle,
    color: 'text-destructive',
    badge: 'Rejected',
    badgeClass: 'bg-destructive/10 text-destructive border-destructive/30',
    subtitle: 'Not a PDP page',
  },
  expired: {
    Icon: AlertCircle,
    color: 'text-amber-500',
    badge: 'Expired',
    badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    subtitle: 'Verification expired',
  },
};

/**
 * Step 2: Add and verify PDP seed URLs.
 * Shows existing seeds grouped by trust status, allows adding new URLs,
 * and polls verification job statuses.
 */
export function BrandSourceSetupPdpSeedStep({
  brandId,
  brandSlug: _brandSlug,
  canonicalDomain,
  pdpSeeds: initialSeeds,
  onSeedsChanged,
  onNext: _onNext,
}: BrandSourceSetupPdpSeedStepProps) {
  const [seeds, setSeeds] = useState<PdpSeedSummary[]>(initialSeeds);
  const [urlInput, setUrlInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [jobStatuses, setJobStatuses] = useState<
    Map<string, { status: string; jobId: string }>
  >(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync seeds when parent data changes (deferred to avoid cascading render warning)
  useEffect(() => {
    const id = setTimeout(() => setSeeds(initialSeeds), 0);
    return () => clearTimeout(id);
  }, [initialSeeds]);

  // Poll active jobs every 3 seconds
  useEffect(() => {
    const activeEntries = Array.from(jobStatuses.entries()).filter(
      ([_, js]) => !TERMINAL_STATUSES.has(js.status),
    );

    if (activeEntries.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      let changed = false;
      for (const [seedId, jobState] of activeEntries) {
        try {
          const res = await fetch(
            `/api/admin/profile-maintenance/jobs/${jobState.jobId}`,
          );
          if (!res.ok) continue;
          const data = await res.json();
          if (data.status !== jobState.status) {
            setJobStatuses((prev) => {
              const next = new Map(prev);
              next.set(seedId, { ...jobState, status: data.status });
              return next;
            });
            changed = true;
          }
        } catch {
          // poll will retry
        }
      }
      if (changed) {
        await onSeedsChanged();
      }
    }, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobStatuses, onSeedsChanged]);

  const addSeed = async () => {
    if (!urlInput.trim()) return;

    setIsAdding(true);
    try {
      const res = await fetch(
        `/api/admin/brands/${brandId}/source-setup/pdp-seeds`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlInput.trim() }),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.existing) {
          toast.error('This PDP seed already exists and is verified');
          return;
        }
        throw new Error(data.error || 'Failed to add seed');
      }

      const newSeed = data.pdpSeed as PdpSeedSummary;

      // Track job for polling
      if (data.verificationJob) {
        setJobStatuses(
          (prev) =>
            new Map(prev).set(newSeed.id, {
              status: data.verificationJob.status,
              jobId: data.verificationJob.id,
            }),
        );
      }

      setSeeds((prev) => [newSeed, ...prev]);
      setUrlInput('');
      toast.success('PDP seed added, verification queued');
      await onSeedsChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to add seed',
      );
    } finally {
      setIsAdding(false);
    }
  };

  const hasDomain = canonicalDomain.length > 0;

  // Group seeds by trust_status
  const verifiedSeeds = seeds.filter((s) => s.trust_status === 'verified');
  const candidateSeeds = seeds.filter((s) => s.trust_status === 'candidate');
  const rejectedSeeds = seeds.filter((s) => s.trust_status === 'rejected');
  const expiredSeeds = seeds.filter((s) => s.trust_status === 'expired');

  return (
    <div className="space-y-6">
      {/* Add seed form */}
      {hasDomain ? (
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-foreground">
            Add Product Detail Page URL
          </label>
          <p className="text-xs text-muted-foreground">
            Must belong to{' '}
            <span className="font-mono font-semibold">{canonicalDomain}</span>
          </p>
          <div className="flex gap-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/product/..."
              className="flex-1 font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isAdding) void addSeed();
              }}
            />
            <Button
              onClick={() => void addSeed()}
              disabled={isAdding || !urlInput.trim()}
              className="rounded-none text-xs font-semibold"
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Verify'
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-4 border border-dashed border-amber-500/50 bg-amber-500/5 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Save a domain first before adding PDP seeds.
        </div>
      )}

      {/* Seed list */}
      <div className="space-y-2">
        {verifiedSeeds.map((seed) => (
          <SeedCard key={seed.id} seed={seed} variant="verified" />
        ))}
        {candidateSeeds.map((seed) => {
          const jobInfo = jobStatuses.get(seed.id);
          const isChecking =
            jobInfo && !TERMINAL_STATUSES.has(jobInfo.status);
          return (
            <SeedCard
              key={seed.id}
              seed={seed}
              variant={isChecking ? 'checking' : 'candidate'}
              jobStatus={jobInfo?.status}
            />
          );
        })}
        {rejectedSeeds.map((seed) => (
          <SeedCard key={seed.id} seed={seed} variant="rejected" />
        ))}
        {expiredSeeds.map((seed) => (
          <SeedCard key={seed.id} seed={seed} variant="expired" />
        ))}
        {seeds.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No PDP seeds yet. Add a product URL above to begin.
          </div>
        )}
      </div>

      {/* Seed count summary */}
      {seeds.length > 0 && (
        <div className="text-xs text-muted-foreground border-t border-border pt-3 flex gap-3">
          {verifiedSeeds.length > 0 && (
            <span className="text-brand-forest-green font-semibold">
              {verifiedSeeds.length} verified
            </span>
          )}
          {candidateSeeds.length > 0 && (
            <span className="text-muted-foreground">
              {candidateSeeds.length} candidate
            </span>
          )}
          {rejectedSeeds.length > 0 && (
            <span className="text-destructive">
              {rejectedSeeds.length} rejected
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SeedCard sub-component
// =============================================================================

function SeedCard({
  seed,
  variant,
  jobStatus,
}: {
  seed: PdpSeedSummary;
  variant: PdpSeedVariant;
  jobStatus?: string;
}) {
  const config = SEED_CARD_CONFIG[variant];
  const { Icon, color, badge, badgeClass, subtitle } = config;

  const displaySubtitle =
    variant === 'checking' && jobStatus
      ? `Verifying... ${jobStatus}`
      : subtitle;

  return (
    <div className="flex items-center gap-3 p-3 border border-border bg-card">
      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-mono text-foreground truncate"
          title={seed.url}
        >
          {seed.url}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {displaySubtitle}
          {seed.verification_artifact_id && (
            <>
              {' · '}
              <a
                href={`/admin/profile-maintenance?tab=artifacts&id=${seed.verification_artifact_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand-forest-green hover:underline"
              >
                View evidence ↗
              </a>
            </>
          )}
        </p>
      </div>
      {badge && (
        <Badge
          variant="outline"
          className={`text-[9px] rounded-none ${badgeClass}`}
        >
          {badge}
        </Badge>
      )}
    </div>
  );
}
