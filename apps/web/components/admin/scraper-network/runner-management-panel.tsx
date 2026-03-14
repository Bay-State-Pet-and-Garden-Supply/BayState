'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  renameRunner,
  pauseRunner,
  resumeRunner,
  deleteRunner,
  updateRunnerMetadata,
} from '@/app/admin/scrapers/network/[id]/actions';
import { Check, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { RunnerDetail } from './runner-detail-client';

interface RunnerManagementPanelProps {
  runner: RunnerDetail;
}

export function RunnerManagementPanel({ runner }: RunnerManagementPanelProps) {
  const [isPending, startTransition] = useTransition();
  
  // Rename state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState(runner.name);
  
  // API Key state
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [copiedApiKey, setCopiedApiKey] = useState(false);
  
  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  
  // Metadata state
  const [metadataEditOpen, setMetadataEditOpen] = useState(false);
  const [metadataJson, setMetadataJson] = useState(
    JSON.stringify(runner.metadata || {}, null, 2)
  );
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const handleRename = async () => {
    if (!newName.trim() || newName === runner.name) {
      toast.error('Please enter a new name');
      return;
    }

    startTransition(async () => {
      const result = await renameRunner(runner.id, newName);
      if (result.success) {
        toast.success('Runner renamed successfully');
        setRenameDialogOpen(false);
      } else {
        toast.error(result.error || 'Failed to rename runner');
      }
    });
  };

  const handlePauseResume = async () => {
    startTransition(async () => {
      if (runner.status === 'paused') {
        const result = await resumeRunner(runner.id);
        if (result.success) {
          toast.success('Runner resumed');
        } else {
          toast.error(result.error || 'Failed to resume runner');
        }
      } else {
        const result = await pauseRunner(runner.id);
        if (result.success) {
          toast.success('Runner paused');
        } else {
          toast.error(result.error || 'Failed to pause runner');
        }
      }
    });
  };

  const handleDelete = async () => {
    if (deleteConfirmName !== runner.name) {
      toast.error('Runner name does not match');
      return;
    }

    startTransition(async () => {
      const result = await deleteRunner(runner.id);
      if (result.success) {
        toast.success('Runner deleted');
        // Navigate back to network page
        window.location.href = '/admin/scrapers/network';
      } else {
        toast.error(result.error || 'Failed to delete runner');
      }
    });
  };

  const handleUpdateMetadata = async () => {
    try {
      const metadata = JSON.parse(metadataJson);
      setMetadataError(null);

      startTransition(async () => {
        const result = await updateRunnerMetadata(runner.id, metadata);
        if (result.success) {
          toast.success('Metadata updated');
          setMetadataEditOpen(false);
        } else {
          toast.error(result.error || 'Failed to update metadata');
        }
      });
    } catch {
      setMetadataError('Invalid JSON');
    }
  };

  const handleApiKeyRegenerate = async () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/runners/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runner_name: runner.name,
            description: 'Rotated API key',
            rotate_existing: true,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to rotate API key');
        }

        setNewApiKey(data.api_key);
        setCopiedApiKey(false);
        setApiKeyDialogOpen(false);
        toast.success('API key rotated. Previous active keys were revoked.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to rotate API key';
        toast.error(message);
      }
    });
  };

  const handleCopyApiKey = async () => {
    if (!newApiKey) {
      return;
    }

    await navigator.clipboard.writeText(newApiKey);
    setCopiedApiKey(true);
    setTimeout(() => setCopiedApiKey(false), 1500);
  };

  const isPaused = runner.status === 'paused';

  return (
    <div className="space-y-6">
      <Tabs defaultValue="rename" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="rename">Rename</TabsTrigger>
          <TabsTrigger value="api-key">API Key</TabsTrigger>
          <TabsTrigger value="pause">Pause</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
          <TabsTrigger value="delete" className="text-red-600">Delete</TabsTrigger>
        </TabsList>

        {/* Rename Tab */}
        <TabsContent value="rename">
          <Card>
            <CardHeader>
              <CardTitle>Rename Runner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Name</label>
                <Input value={runner.name} disabled />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">New Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter new runner name"
                />
              </div>
              <Button onClick={() => setRenameDialogOpen(true)} disabled={isPending}>
                {isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Key Tab */}
        <TabsContent value="api-key">
          <Card>
            <CardHeader>
              <CardTitle>API Key Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Current API Key</label>
                <Input value="bsr_••••••••••••••••" disabled />
                <p className="text-xs text-muted-foreground">
                  API keys are masked for security. Rotate to issue a new key and revoke all previous active keys.
                </p>
              </div>
              <Button onClick={() => setApiKeyDialogOpen(true)} variant="outline" disabled={isPending}>
                Rotate API Key
              </Button>
              {newApiKey && (
                <div className="space-y-2 rounded-md border bg-amber-50 p-3">
                  <label className="text-sm font-medium">New API Key (shown once)</label>
                  <div className="flex gap-2">
                    <Input value={newApiKey} readOnly className="font-mono text-sm" />
                    <Button variant="outline" size="icon" onClick={handleCopyApiKey} aria-label="Copy API key">
                      {copiedApiKey ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Update the runner machine with this key in <code className="rounded bg-white px-1">~/.baystate-scraper/runner.env</code> and restart the container.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pause Tab */}
        <TabsContent value="pause">
          <Card>
            <CardHeader>
              <CardTitle>Pause / Resume Runner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant={isPaused ? 'secondary' : 'default'}>
                  {isPaused ? 'Paused' : 'Active'}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {isPaused
                    ? 'This runner will not accept new jobs.'
                    : 'This runner is accepting new jobs.'}
                </p>
              </div>
              <Button
                onClick={handlePauseResume}
                variant={isPaused ? 'default' : 'destructive'}
                disabled={isPending}
              >
                {isPending
                  ? isPaused
                    ? 'Resuming...'
                    : 'Pausing...'
                  : isPaused
                  ? 'Resume Runner'
                  : 'Pause Runner'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metadata Tab */}
        <TabsContent value="metadata">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Metadata (JSON)</label>
                <Textarea
                  value={metadataJson}
                  onChange={(e) => setMetadataJson(e.target.value)}
                  className="font-mono min-h-[200px]"
                  disabled={isPending}
                />
                {metadataError && (
                  <p className="text-sm text-red-600">{metadataError}</p>
                )}
              </div>
              <Button onClick={() => setMetadataEditOpen(true)} disabled={isPending}>
                {isPending ? 'Saving...' : 'Save Metadata'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Delete Tab */}
        <TabsContent value="delete">
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600">Delete Runner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
                <strong>Warning:</strong> This action will permanently delete this runner
                and all associated API keys. This action cannot be undone.
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Type <code className="bg-gray-100 px-1">{runner.name}</code> to confirm
                </label>
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={runner.name}
                />
              </div>
              <Button
                onClick={() => setDeleteDialogOpen(true)}
                variant="destructive"
                disabled={deleteConfirmName !== runner.name || isPending}
              >
                {isPending ? 'Deleting...' : 'Delete Runner'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rename Confirmation Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Runner</DialogTitle>
            <DialogDescription>
              Are you sure you want to rename this runner from "{runner.name}" to "{newName}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={isPending}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate API Key</DialogTitle>
            <DialogDescription>
              This generates a new key and revokes all previous active keys for this runner.
              You will need to update the key on the runner machine immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApiKeyRegenerate} disabled={isPending}>
              Rotate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Metadata Save Dialog */}
      <Dialog open={metadataEditOpen} onOpenChange={setMetadataEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Metadata</DialogTitle>
            <DialogDescription>
              Are you sure you want to save these metadata changes?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetadataEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateMetadata} disabled={isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Runner</DialogTitle>
            <DialogDescription>
              This will permanently delete runner "{runner.name}" and all associated API keys.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConfirmName !== runner.name || isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
