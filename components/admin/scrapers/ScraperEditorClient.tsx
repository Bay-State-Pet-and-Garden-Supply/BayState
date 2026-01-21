'use client';

import { useState, useCallback, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { stringify, parse } from 'yaml';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  Play,
  RotateCcw,
  ExternalLink,
  Settings,
  FileCode,
  AlertCircle,
  CheckCircle2,
  GitBranch,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { ScraperRecord, ScraperConfig, ScraperStatus } from '@/lib/admin/scrapers/types';
import { scraperConfigSchema } from '@/lib/admin/scrapers/schema';
import { ScraperStatusBadge, ScraperHealthBadge } from './ScraperStatusBadge';
import { updateScraper, updateScraperStatus } from '@/app/admin/scrapers/actions';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface ScraperEditorClientProps {
  scraper: ScraperRecord;
}

export function ScraperEditorClient({ scraper }: ScraperEditorClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [yamlContent, setYamlContent] = useState(() => {
    try {
      return stringify(scraper.config, { indent: 2 });
    } catch {
      return '';
    }
  });
  const [originalYaml, setOriginalYaml] = useState(yamlContent);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [displayName, setDisplayName] = useState(scraper.display_name || '');
  const [baseUrl, setBaseUrl] = useState(scraper.base_url);
  const [status, setStatus] = useState<ScraperStatus>(scraper.status);

  useEffect(() => {
    setHasChanges(yamlContent !== originalYaml);
  }, [yamlContent, originalYaml]);



  const validateYaml = useCallback((content: string): { valid: boolean; config?: ScraperConfig; error?: string } => {
    try {
      const parsed = parse(content);
      const result = scraperConfigSchema.safeParse(parsed);
      if (result.success) {
        return { valid: true, config: result.data as ScraperConfig };
      }
      const firstError = result.error.issues[0];
      return { valid: false, error: `${firstError.path.join('.')}: ${firstError.message}` };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Invalid YAML syntax' };
    }
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    const content = value || '';
    setYamlContent(content);

    const validation = validateYaml(content);
    setValidationError(validation.valid ? null : (validation.error || 'Unknown error'));
  }, [validateYaml]);

  const handleSave = useCallback(() => {
    const validation = validateYaml(yamlContent);
    if (!validation.valid || !validation.config) {
      toast.error('Cannot save: ' + (validation.error || 'Invalid configuration'));
      return;
    }

    const config = validation.config;

    startTransition(async () => {
      const result = await updateScraper(scraper.id, {
        config,
        base_url: config.base_url,
        name: config.name,
        display_name: config.display_name || undefined,
      });

      if (result.success) {
        toast.success('Scraper saved successfully');
        setOriginalYaml(yamlContent);
        setHasChanges(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to save');
      }
    });
  }, [validateYaml, yamlContent, scraper.id, router]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && !validationError) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, validationError, yamlContent, handleSave]);

  const handleReset = () => {
    setYamlContent(originalYaml);
    setValidationError(null);
  };

  const handleStatusChange = (newStatus: ScraperStatus) => {
    startTransition(async () => {
      const result = await updateScraperStatus(scraper.id, newStatus);
      if (result.success) {
        setStatus(newStatus);
        toast.success(`Status updated to ${newStatus}`);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to update status');
      }
    });
  };

  const handleSettingsSave = () => {
    startTransition(async () => {
      const result = await updateScraper(scraper.id, {
        display_name: displayName || undefined,
        base_url: baseUrl,
      });

      if (result.success) {
        toast.success('Settings saved');
        setIsSettingsOpen(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to save settings');
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/scrapers">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="h-6 w-px bg-gray-300" />
          <div className="flex items-center gap-3">
            <FileCode className="h-5 w-5 text-blue-600" />
            <div>
              <h1 className="text-lg font-semibold">{scraper.display_name || scraper.name}</h1>
              <p className="text-xs text-gray-600">{scraper.base_url}</p>
            </div>
          </div>
          <ScraperStatusBadge status={status} />
          <ScraperHealthBadge health={scraper.health_status} score={scraper.health_score} />
        </div>

        <div className="flex items-center gap-2">
          {validationError ? (
            <div className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="max-w-xs truncate">{validationError}</span>
            </div>
          ) : hasChanges ? (
            <div className="flex items-center gap-1 text-sm text-amber-600">
              <span>Unsaved changes</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span>Saved</span>
            </div>
          )}

          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/scrapers/${scraper.id}/workflow`}>
              <GitBranch className="mr-1 h-4 w-4" />
              Visual
            </Link>
          </Button>

          <Button variant="outline" size="sm" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="mr-1 h-4 w-4" />
            Settings
          </Button>

          <Button variant="outline" size="sm" asChild>
            <a href={scraper.base_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" />
              Visit Site
            </a>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!hasChanges || isPending}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || !!validationError || isPending}
          >
            <Save className="mr-1 h-4 w-4" />
            {isPending ? 'Saving...' : 'Save'}
          </Button>

          <Button variant="default" size="sm" asChild>
            <Link href={`/admin/scrapers/${scraper.id}/test`}>
              <Play className="mr-1 h-4 w-4" />
              Test
            </Link>
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <MonacoEditor
            height="100%"
            language="yaml"
            theme="vs-dark"
            value={yamlContent}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              insertSpaces: true,
              automaticLayout: true,
              folding: true,
              renderLineHighlight: 'all',
              scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
            }}
          />
        </div>

        {/* Right sidebar - Quick Info */}
        <div className="w-80 border-l bg-gray-50 overflow-y-auto">
          <div className="p-4 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Workflow Steps</span>
                  <span className="font-medium">{scraper.config?.workflows?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Selectors</span>
                  <span className="font-medium">{scraper.config?.selectors?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Test SKUs</span>
                  <span className="font-medium">{scraper.config?.test_skus?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fake SKUs</span>
                  <span className="font-medium">{scraper.config?.fake_skus?.length || 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={status} onValueChange={(v) => handleStatusChange(v as ScraperStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Keyboard Shortcuts</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1 text-gray-600">
                <div className="flex justify-between">
                  <span>Save</span>
                  <kbd className="rounded bg-gray-200 px-1.5 py-0.5">Cmd+S</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Format</span>
                  <kbd className="rounded bg-gray-200 px-1.5 py-0.5">Shift+Alt+F</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Find</span>
                  <kbd className="rounded bg-gray-200 px-1.5 py-0.5">Cmd+F</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Fold All</span>
                  <kbd className="rounded bg-gray-200 px-1.5 py-0.5">Cmd+K Cmd+0</kbd>
                </div>
              </CardContent>
            </Card>

            {scraper.last_test_at && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Last Test</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="text-gray-600">
                    {new Date(scraper.last_test_at).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scraper Settings</DialogTitle>
            <DialogDescription>
              Update display name and base URL for this scraper.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={scraper.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSettingsSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
