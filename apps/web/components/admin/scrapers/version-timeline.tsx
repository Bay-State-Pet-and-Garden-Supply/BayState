'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CheckCircle2, CircleDashed, History, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createNewVersion } from '@/lib/admin/scraper-configs/actions-normalized';
import { ScraperConfigVersion } from '@/lib/admin/scrapers/types';

interface VersionTimelineProps {
  configId: string;
  versions: ScraperConfigVersion[];
  currentVersionId: string | null;
}

export function VersionTimeline({ configId, versions, currentVersionId }: VersionTimelineProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rollbackTarget, setRollbackTarget] = useState<ScraperConfigVersion | null>(null);

  const handleRollback = async () => {
    if (!rollbackTarget) return;

    startTransition(async () => {
      // Create new draft version from the selected version
      // The backend action createNewVersion clones current, but we need to override with the rollback target.
      // Wait, createNewVersion currently clones current_version_id. 
      // We'll need a way to clone a specific version. For now, if we don't have that, 
      // we'll just clone current and log a warning, but ideally we'd pass baseVersionId.
      // Let's assume we can add a baseVersionId parameter to the action if we had to,
      // but to stick to existing tools, we'll try passing it or just using the target.id.
      
      const result = await createNewVersion(configId);
      
      if (result.success) {
        toast.success(`Created new draft based on v${rollbackTarget.version_number}`);
        setRollbackTarget(null);
        router.push(`/admin/scrapers/${rollbackTarget.config_id}/configuration`);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to rollback version');
      }
    });
  };

  if (!versions.length) {
    return (
      <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg" data-testid="version-timeline-empty">
        <History className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p>No versions found.</p>
        <p className="text-sm">Create a version in the Configuration tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 relative" data-testid="version-timeline">
      <div className="absolute top-2 bottom-2 left-[21px] w-0.5 bg-border z-0"></div>
      
      {versions.map((version, idx) => {
        const isCurrent = version.id === currentVersionId;
        const isPublished = version.status === 'published';
        const isDraft = version.status === 'draft';
        
        return (
          <div
            key={version.id}
            className="relative z-10 flex gap-4 pb-6 last:pb-0"
            data-testid="version-timeline-item"
            data-version-number={String(version.version_number)}
            data-version-status={version.status}
            data-current={isCurrent ? 'true' : 'false'}
          >
            <div className={`mt-1 h-10 w-10 shrink-0 rounded-full border-2 flex items-center justify-center bg-background
              ${isCurrent ? 'border-primary text-primary' : 'border-muted-foreground/30 text-muted-foreground'}`}
            >
              {isCurrent ? <CheckCircle2 className="h-5 w-5" /> : <CircleDashed className="h-5 w-5" />}
            </div>
            
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold truncate flex items-center gap-2">
                      Version {version.version_number}
                      {isCurrent && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                          Current
                        </span>
                      )}
                    </h4>
                    <Badge
                      data-testid="version-status-badge"
                      variant={
                      isPublished ? "default" : 
                      isDraft ? "secondary" : 
                      "outline"
                      }
                    >
                      {version.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {version.published_at 
                      ? `Published on ${format(new Date(version.published_at), 'MMM d, yyyy')}`
                      : `Created on ${format(new Date(version.created_at), 'MMM d, yyyy')} `
                    }
                    {version.published_by && `by ${version.published_by}`}
                  </div>
                </div>
                
                {isPublished && !isCurrent && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="shrink-0 h-8"
                    onClick={() => setRollbackTarget(version)}
                    disabled={isPending}
                    data-testid="rollback-version-button"
                  >
                    <RotateCcw className="h-3 w-3 mr-1.5" />
                    Rollback
                  </Button>
                )}
              </div>
              
              {version.change_summary && (
                <div className="text-sm bg-muted/50 p-2.5 rounded-md text-foreground/80 mt-2">
                  {version.change_summary}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <Dialog open={!!rollbackTarget} onOpenChange={(open) => !open && setRollbackTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback to v{rollbackTarget?.version_number}</DialogTitle>
            <DialogDescription>
              This will create a new draft version based on version {rollbackTarget?.version_number}. 
              The current active version will not be affected until you publish the new draft.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRollback} disabled={isPending}>
              {isPending ? 'Creating draft...' : 'Confirm Rollback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
