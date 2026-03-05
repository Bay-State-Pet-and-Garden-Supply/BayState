
'use client';

import { useState, useTransition } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { publishConfig } from '@/lib/admin/scraper-configs/actions';

interface PublishButtonProps {
  configId: string;
  isValidated: boolean;
  onPublishSuccess?: () => void;
}

export function PublishButton({ configId, isValidated, onPublishSuccess }: PublishButtonProps) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [isPending, startTransition] = useTransition();

  const handlePublish = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append('configId', configId);
      formData.append('change_summary', summary);

      const result = await publishConfig(formData);

      if (result.success) {
        toast.success('Configuration published successfully');
        setOpen(false);
        onPublishSuccess?.();
      } else {
        toast.error('Publish failed', {
          description: result.error || 'Could not publish configuration',
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!isValidated}>
          <Upload className="mr-2 h-4 w-4" />
          Publish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish Configuration</DialogTitle>
          <DialogDescription>
            This will make the current draft the active version for this scraper.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="summary">Change Summary</Label>
            <Input
              id="summary"
              placeholder="e.g. Added price selector for new layout"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={isPending || !summary}>
            {isPending ? 'Publishing...' : 'Publish Version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
