'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Check, AlertCircle } from 'lucide-react';
import {
  renameRunner,
  disableRunner,
  enableRunner,
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
  const router = useRouter();
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
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to rename runner');
      }
    });
  };

  const handleToggleAccess = async () => {
    startTransition(async () => {
      if (runner.enabled) {
        const result = await disableRunner(runner.id);
        if (result.success) {
          toast.success('Runner disabled');
          router.refresh();
        } else {
          toast.error(result.error || 'Failed to disable runner');
        }
      } else {
        const result = await enableRunner(runner.id);
        if (result.success) {
          toast.success('Runner enabled');
          router.refresh();
        } else {
          toast.error(result.error || 'Failed to enable runner');
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
          router.refresh();
        } else {
          toast.error(result.error || 'Failed to update metadata');
        }
      });
    } catch {
      setMetadataError('Invalid JSON');
    }
  };

  const handleRotateApiKey = async () => {
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

  const isEnabled = runner.enabled;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="rename" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="rename">Rename</TabsTrigger>
          <TabsTrigger value="api-key">API Key</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
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
                  API keys are masked for security. Rotate the key to invalidate the current one and reveal a new key once.
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
                Rotate API Key
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Access Tab */}
        <TabsContent value="access">
          <Card>
            <CardHeader>
              <CardTitle>Runner Access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant={isEnabled ? 'default' : 'destructive'}>
                  {isEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {isEnabled
                    ? 'This runner can claim new jobs with its current API key.'
                    : 'This runner cannot claim new jobs right now, but its API key remains intact for later re-enable or rotation.'}
                </p>
              </div>
              <Button
                onClick={handleToggleAccess}
                variant={isEnabled ? 'destructive' : 'default'}
                disabled={isPending}
              >
                {isPending
                  ? isEnabled
                    ? 'Disabling...'
                    : 'Enabling...'
                  : isEnabled
                  ? 'Disable Runner'
                  : 'Enable Runner'}
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
                  Type <code className="bg-muted px-1">{runner.name}</code> to confirm
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
            <DialogTitle>{newApiKey ? 'New API Key Generated' : 'Rotate API Key'}</DialogTitle>
            <DialogDescription>
              {newApiKey 
                ? 'Please copy your new API key now. You will not be able to see it again.'
                : 'Are you sure you want to rotate this runner\'s API key? Existing active keys for this runner will stop working immediately.'}
            </DialogDescription>
          </DialogHeader>

          {newApiKey ? (
            <div className="space-y-4 py-4">
              <Alert className="bg-amber-50 border-amber-200 text-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle>Important Security Warning</AlertTitle>
                <AlertDescription>
                  This key will only be shown once. If you lose it, you will need to rotate it again.
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
                <Button onClick={handleRotateApiKey} disabled={isPending}>
                  {isPending ? 'Rotating...' : 'Rotate Key'}
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
