'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RunnerDetailClient } from './runner-detail-client';
import type { RunnerDetail } from './types';
import { createClient } from '@/lib/supabase/client';
import {
  coerceRunnerMetadata,
  getEffectiveRunnerStatus,
  getRunnerBuildCheckReason,
  getRunnerVersion,
} from '@/lib/scraper-runners';

interface RunnerDetailDrawerProps {
  runner?: RunnerDetail | null;
  runnerId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function RunnerDetailDrawer({
  runner: initialRunner,
  runnerId,
  isOpen,
  onClose,
}: RunnerDetailDrawerProps) {
  const [runner, setRunner] = useState<RunnerDetail | null>(initialRunner || null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialRunner) {
      setRunner(initialRunner);
      return;
    }

    if (isOpen && runnerId && !initialRunner) {
      const fetchRunner = async () => {
        setIsLoading(true);
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('scraper_runners')
            .select('name, status, enabled, last_seen_at, current_job_id, metadata, created_at')
            .eq('name', runnerId)
            .single();

          if (!error && data) {
            const metadata = coerceRunnerMetadata(data.metadata) || {};
            setRunner({
              id: data.name,
              name: data.name,
              status: getEffectiveRunnerStatus(data) as RunnerDetail['status'],
              enabled: data.enabled,
              last_seen_at: data.last_seen_at,
              active_jobs: data.current_job_id ? 1 : 0,
              region: (metadata.region as string) || null,
              version: getRunnerVersion(metadata),
              build_check_reason: getRunnerBuildCheckReason(metadata),
              latest_build_sha: (metadata.latest_build_sha as string) || null,
              latest_build_id: (metadata.latest_build_id as string) || null,
              metadata,
            });
          }
        } catch (error) {
          console.error('Error fetching runner in drawer:', error);
        } finally {
          setIsLoading(false);
        }
      };

      void fetchRunner();
    }
  }, [initialRunner, isOpen, runnerId]);

  useEffect(() => {
    if (!isOpen && runnerId && !initialRunner) {
      setRunner(null);
    }
  }, [initialRunner, isOpen, runnerId]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-[840px] flex-col p-0 sm:max-w-[840px]">
        <SheetHeader className="border-b border-border bg-card px-6 py-5 text-left">
          <SheetTitle>{isLoading ? 'Loading runner' : runner?.name || 'Runner details'}</SheetTitle>
          <SheetDescription>
            {runner ? `Review access, recent activity, and configuration for ${runner.name}.` : 'Fetching runner details.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-[var(--surface-admin-bg)] px-6 py-5">
          {isLoading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              <p className="text-sm text-muted-foreground">Loading runner details...</p>
            </div>
          ) : runner ? (
            <RunnerDetailClient runner={runner} isEmbedded />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 text-center">
              <p className="font-medium text-foreground">Runner details are not available.</p>
              <p className="text-sm text-muted-foreground">
                Try reopening this row. If the issue continues, refresh runner health and try again.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
