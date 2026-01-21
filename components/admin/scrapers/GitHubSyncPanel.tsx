'use client';

import { useState, useEffect, useTransition } from 'react';
import { toast } from 'sonner';
import { stringify } from 'yaml';
import {
  Github,
  RefreshCw,
  Upload,
  Download,
  Check,
  AlertCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

import { pullFromGitHub, pushToGitHub, getGitHubSyncStatus } from '@/app/admin/scrapers/github-actions';
import { ScraperConfig } from '@/lib/admin/scrapers/types';

interface GitHubSyncPanelProps {
  scraperId: string;
  scraperName: string;
  config: ScraperConfig;
  onConfigPulled?: (yamlContent: string) => void;
}

type SyncStatus = 'idle' | 'synced' | 'pending' | 'error';

export function GitHubSyncPanel({ 
  scraperId, 
  scraperName, 
  config,
  onConfigPulled,
}: GitHubSyncPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [filePath, setFilePath] = useState(`scrapers/configs/${scraperName}.yaml`);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastCommitUrl, setLastCommitUrl] = useState<string | null>(null);

  const [isPullDialogOpen, setIsPullDialogOpen] = useState(false);
  const [pulledContent, setPulledContent] = useState<string | null>(null);

  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  useEffect(() => {
    startTransition(async () => {
      const status = await getGitHubSyncStatus(scraperId);
      if (status.configured) {
        setRepoUrl(status.repoUrl || '');
        setBranch(status.branch || 'main');
        setFilePath(status.filePath || `scrapers/configs/${scraperName}.yaml`);
        setLastSyncAt(status.lastSyncAt || null);
        setSyncStatus('synced');
      }
    });
  }, [scraperId, scraperName]);

  const handlePull = () => {
    if (!repoUrl) {
      toast.error('Repository URL is required');
      return;
    }

    startTransition(async () => {
      const result = await pullFromGitHub(scraperId, repoUrl, branch, filePath);
      
      if (result.success && result.content) {
        setPulledContent(result.content);
        setIsPullDialogOpen(true);
      } else {
        toast.error(result.error || 'Failed to pull from GitHub');
        setSyncStatus('error');
      }
    });
  };

  const handleConfirmPull = () => {
    if (pulledContent && onConfigPulled) {
      onConfigPulled(pulledContent);
      toast.success('Configuration pulled and applied');
      setLastSyncAt(new Date().toISOString());
      setSyncStatus('synced');
    }
    setIsPullDialogOpen(false);
    setPulledContent(null);
  };

  const handlePush = () => {
    if (!repoUrl) {
      toast.error('Repository URL is required');
      return;
    }
    setCommitMessage(`Update ${scraperName} scraper config`);
    setIsPushDialogOpen(true);
  };

  const handleConfirmPush = () => {
    startTransition(async () => {
      const yamlContent = stringify(config, { indent: 2 });
      const result = await pushToGitHub(
        scraperId,
        repoUrl,
        branch,
        filePath,
        yamlContent,
        commitMessage
      );
      
      if (result.success) {
        toast.success('Configuration pushed to GitHub');
        setLastSyncAt(new Date().toISOString());
        setLastCommitUrl(result.commitUrl || null);
        setSyncStatus('synced');
      } else {
        toast.error(result.error || 'Failed to push to GitHub');
        setSyncStatus('error');
      }
      
      setIsPushDialogOpen(false);
    });
  };

  const getStatusBadge = () => {
    switch (syncStatus) {
      case 'synced':
        return (
          <Badge className="bg-green-100 text-green-700">
            <Check className="h-3 w-3 mr-1" />
            Synced
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case 'error':
        return (
          <Badge className="bg-red-100 text-red-700">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-700">
            Not Configured
          </Badge>
        );
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Github className="h-4 w-4" />
            GitHub Sync
          </CardTitle>
          <CardDescription>
            Sync scraper configuration with a GitHub repository
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Status</span>
            {getStatusBadge()}
          </div>

          {lastSyncAt && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Last Sync</span>
              <span>{new Date(lastSyncAt).toLocaleString()}</span>
            </div>
          )}

          {lastCommitUrl && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Last Commit</span>
              <a 
                href={lastCommitUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                View <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label htmlFor="repoUrl" className="text-xs">
                Repository URL
              </Label>
              <Input
                id="repoUrl"
                placeholder="https://github.com/org/BayStateScraper"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="branch" className="text-xs">
                  Branch
                </Label>
                <Input
                  id="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="filePath" className="text-xs">
                  File Path
                </Label>
                <Input
                  id="filePath"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePull}
              disabled={isPending || !repoUrl}
              className="flex-1"
            >
              {isPending ? (
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Pull
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePush}
              disabled={isPending || !repoUrl}
              className="flex-1"
            >
              {isPending ? (
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              Push
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isPullDialogOpen} onOpenChange={setIsPullDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm Pull</DialogTitle>
            <DialogDescription>
              This will replace your current configuration with the version from GitHub.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            <pre className="text-xs font-mono bg-gray-100 p-3 rounded">
              {pulledContent}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPullDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmPull}>
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPushDialogOpen} onOpenChange={setIsPushDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push to GitHub</DialogTitle>
            <DialogDescription>
              Commit your current configuration to {filePath}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="commitMessage">Commit Message</Label>
              <Textarea
                id="commitMessage"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Describe your changes..."
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPushDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmPush} disabled={isPending}>
              {isPending ? 'Pushing...' : 'Push'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
