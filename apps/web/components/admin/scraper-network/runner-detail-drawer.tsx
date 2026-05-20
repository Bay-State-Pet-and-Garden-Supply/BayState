'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RunnerDetailClient } from './runner-detail-client';
import type { RunnerDetail } from './types';
import { getRunnerDetail } from '@/app/admin/pipeline/runners/actions';

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
          const result = await getRunnerDetail(runnerId);
          if (result.success && result.runner) {
            setRunner(result.runner);
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
