'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Copy, Check, AlertCircle } from 'lucide-react';
import {
  renameRunner,
  pauseRunner,
  resumeRunner,
  deleteRunner,
  updateRunnerMetadata,
  rotateRunnerKey,
} from '@/app/admin/scrapers/network/[id]/actions';

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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  const [copied, setCopied] = useState(false);
  
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
      const result = await rotateRunnerKey(runner.id);
      if (result.success && result.key) {
        setNewApiKey(result.key);
        toast.success('API key rotated successfully');
      } else {
        toast.error(result.error || 'Failed to rotate API key');
      }
    });
  };

  const copyToClipboard = () => {
    if (newApiKey) {
      navigator.clipboard.writeText(newApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Copied to clipboard');
    }
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
                  API keys are masked for security. Regenerate to get a new key.
                </p>
              </div>
              <Button 
                onClick={() => {
                  setNewApiKey(null);
                  setApiKeyDialogOpen(true);
                }} 
                variant="outline" 
                disabled={isPending}
              >
                Regenerate API Key
              </Button>
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
              Are you sure you want to rename this runner from &quot;{runner.name}&quot; to &quot;{newName}&quot;?
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

      {/* API Key Regenerate Dialog */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={(open) => {
        if (!open && newApiKey) {
          setNewApiKey(null);
        }
        setApiKeyDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{newApiKey ? 'New API Key Generated' : 'Regenerate API Key'}</DialogTitle>
            <DialogDescription>
              {newApiKey 
                ? 'Please copy your new API key now. You will not be able to see it again.'
                : 'Are you sure you want to regenerate this runner\'s API key? The old key will stop working immediately.'}
            </DialogDescription>
          </DialogHeader>

          {newApiKey ? (
            <div className="space-y-4 py-4">
              <Alert className="bg-amber-50 border-amber-200 text-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle>Important Security Warning</AlertTitle>
                <AlertDescription>
                  This key will only be shown once. If you lose it, you will need to regenerate it again.
                </AlertDescription>
              </Alert>
              
              <div className="flex items-center space-x-2">
                <div className="grid flex-1 gap-2">
                  <label htmlFor="api-key" className="sr-only">
                    API Key
                  </label>
                  <Input
                    id="api-key"
                    value={newApiKey}
                    readOnly
                    className="font-mono text-xs h-9"
                  />
                </div>
                <Button type="button" size="sm" className="px-3" onClick={copyToClipboard}>
                  <span className="sr-only">Copy</span>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : null}

          <DialogFooter className="sm:justify-start">
            {!newApiKey ? (
              <>
                <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleApiKeyRegenerate} disabled={isPending}>
                  {isPending ? 'Regenerating...' : 'Regenerate'}
                </Button>
              </>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setApiKeyDialogOpen(false)}>
                I have saved the key
              </Button>
            )}
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
              This will permanently delete runner &quot;{runner.name}&quot; and all associated API keys.
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
