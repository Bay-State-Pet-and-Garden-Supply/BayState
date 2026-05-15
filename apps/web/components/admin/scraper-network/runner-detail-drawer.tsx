'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
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
        } catch (err) {
          console.error('Error fetching runner in drawer:', err);
        } finally {
          setIsLoading(false);
        }
      };
      fetchRunner();
    }
  }, [isOpen, runnerId, initialRunner]);

  // Reset runner when drawer closes if it was fetched via runnerId
  useEffect(() => {
    if (!isOpen && runnerId && !initialRunner) {
      setRunner(null);
    }
  }, [isOpen, runnerId, initialRunner]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="sm:max-w-2xl border-l-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] p-0 flex flex-col rounded-none"
      >
        <SheetHeader className="p-6 border-b-4 border-zinc-900 bg-zinc-50 space-y-1">
          <SheetTitle className="text-2xl font-black uppercase tracking-tighter">
            {isLoading ? 'Loading...' : runner?.name || 'Runner Details'}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs text-zinc-500">
            {runner ? `ID: ${runner.id}` : 'Fetching runner information...'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
              <div className="animate-spin rounded-none h-12 w-12 border-4 border-zinc-900 border-t-transparent"></div>
              <p className="font-black uppercase tracking-tighter text-sm">Synchronizing...</p>
            </div>
          ) : runner ? (
            <RunnerDetailClient runner={runner} isEmbedded={true} />
          ) : (
            <div className="text-center py-12 border-4 border-dashed border-zinc-200">
              <p className="font-black uppercase tracking-tighter text-zinc-400">
                Runner not found or failed to load.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
