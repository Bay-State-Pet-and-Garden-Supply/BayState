'use client';

import { useState, useTransition } from 'react';
import {
  CheckCircle,
  Upload,
  Copy,
  History,
  MoreHorizontal,
  Check,
  Loader2,
  AlertCircle,
  Edit,
  Play,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { validateDraft, publishConfig } from '@/lib/admin/scraper-configs/actions';
import { TestResultsDialog } from './TestResultsDialog';

interface ConfigQuickActionsProps {
  configId: string;
  configSlug: string;
  currentStatus: string;
  latestPublishedVersion: number | null;
}

export function ConfigQuickActions({
  configId,
  configSlug,
  currentStatus,
  latestPublishedVersion,
}: ConfigQuickActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [duplicateSlug, setDuplicateSlug] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');

  const handleValidate = () => {
    startTransition(async () => {
      try {
        const result = await validateDraft(configId);
        if (result.success) {
          toast.success('Config validated successfully');
          // Refresh the page to show updated status
          window.location.reload();
        } else {
          toast.error(result.error || 'Validation failed');
        }
      } catch (error) {
        toast.error('An error occurred during validation');
      }
    });
  };

  const handlePublish = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append('configId', configId);
      formData.append('change_summary', 'Published from list view');
      
      try {
        const result = await publishConfig(formData);
        if (result.success) {
          toast.success('Config published successfully');
          window.location.reload();
        } else {
          toast.error(result.error || 'Publish failed');
        }
      } catch (error) {
        toast.error('An error occurred during publish');
      }
    });
  };

  const handleDuplicate = () => {
    // For now, just navigate to a copy page or show a toast
    toast.info(`Duplicate "${configSlug}" - feature coming soon`);
    setShowDuplicateDialog(false);
  };

  const handleViewHistory = () => {
    // Navigate to version history
    window.location.href = `/admin/scraper-configs/${configId}/history`;
  };

  const handleEdit = () => {
    // Navigate to edit page
    window.location.href = `/admin/scraper-configs/${configId}`;
  };

  const canValidate = currentStatus === 'draft';
  const canPublish = currentStatus === 'validated';
  const canRollback = latestPublishedVersion !== null && 
                      latestPublishedVersion > 0 && 
                      latestPublishedVersion !== latestPublishedVersion;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {canValidate && (
            <DropdownMenuItem onClick={handleValidate} disabled={isPending}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Validate
            </DropdownMenuItem>
          )}
          
          {canPublish && (
            <DropdownMenuItem onClick={handlePublish} disabled={isPending}>
              <Upload className="mr-2 h-4 w-4" />
              Publish
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleViewHistory}>
            <History className="mr-2 h-4 w-4" />
            Version History
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setShowTestDialog(true)}>
            <Play className="mr-2 h-4 w-4" />
            Run Test
          </DropdownMenuItem>

          {canRollback && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setShowRollbackDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <History className="mr-2 h-4 w-4" />
                Rollback...
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Duplicate Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Configuration</DialogTitle>
            <DialogDescription>
              Create a copy of "{configSlug}" with a new slug.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="duplicateSlug">New Slug</Label>
              <Input
                id="duplicateSlug"
                placeholder={configSlug + '-copy'}
                value={duplicateSlug}
                onChange={(e) => setDuplicateSlug(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Must be lowercase alphanumeric with hyphens.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate} disabled={!duplicateSlug}>
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback Dialog */}
      <Dialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback Configuration</DialogTitle>
            <DialogDescription>
              Revert to a previous published version. This will create a new published version with the old configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Current latest: v{latestPublishedVersion}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rollbackReason">Rollback Reason</Label>
              <Input
                id="rollbackReason"
                placeholder="Why are you rolling back?"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                This reason will be recorded in the version history.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRollbackDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                toast.info('Rollback feature coming soon');
                setShowRollbackDialog(false);
              }}
              disabled={!rollbackReason}
            >
              Confirm Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TestResultsDialog
        open={showTestDialog}
        onOpenChange={setShowTestDialog}
        configId={configId}
        configSlug={configSlug}
      />
    </>
  );
}
