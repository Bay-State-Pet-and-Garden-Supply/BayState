'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, RefreshCw, Globe, Database } from 'lucide-react';

interface EnrichmentSource {
  id: string;
  displayName: string;
  type: 'scraper' | 'b2b';
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  enabled: boolean;
}

interface EnrichmentDefaults {
  enabled_sources: string[];
  priority_order: string[];
  updated_at?: string;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  offline: 'bg-red-500',
  unknown: 'bg-gray-400',
};

export function EnrichmentDefaultsCard() {
  const [sources, setSources] = useState<EnrichmentSource[]>([]);
  const [defaults, setDefaults] = useState<EnrichmentDefaults>({
    enabled_sources: [],
    priority_order: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/enrichment/defaults');
      if (!res.ok) throw new Error('Failed to fetch enrichment defaults');
      const data = await res.json();
      setSources(data.sources || []);
      setDefaults(data.defaults || { enabled_sources: [], priority_order: [] });
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSource = (sourceId: string) => {
    setDefaults((prev) => {
      const isEnabled = prev.enabled_sources.includes(sourceId);
      const newEnabledSources = isEnabled
        ? prev.enabled_sources.filter((id) => id !== sourceId)
        : [...prev.enabled_sources, sourceId];
      return { ...prev, enabled_sources: newEnabledSources };
    });
    setHasChanges(true);
  };

  const selectAll = (type: 'scraper' | 'b2b') => {
    const typeSourceIds = sources.filter((s) => s.type === type).map((s) => s.id);
    setDefaults((prev) => {
      const otherSources = prev.enabled_sources.filter(
        (id) => !typeSourceIds.includes(id)
      );
      return { ...prev, enabled_sources: [...otherSources, ...typeSourceIds] };
    });
    setHasChanges(true);
  };

  const deselectAll = (type: 'scraper' | 'b2b') => {
    const typeSourceIds = sources.filter((s) => s.type === type).map((s) => s.id);
    setDefaults((prev) => ({
      ...prev,
      enabled_sources: prev.enabled_sources.filter((id) => !typeSourceIds.includes(id)),
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/enrichment/defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaults),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const scraperSources = sources.filter((s) => s.type === 'scraper');
  const b2bSources = sources.filter((s) => s.type === 'b2b');

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enrichment Defaults</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <Database className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle>Enrichment Defaults</CardTitle>
              <CardDescription>
                Default sources for new products in pipeline
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <p className="text-sm text-muted-foreground">
          Select which data sources should be enabled by default for new products entering the
          pipeline. Individual products can override these settings.
        </p>

        {/* Scrapers Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Web Scrapers</span>
              <Badge variant="secondary" className="text-xs">
                {scraperSources.filter((s) => defaults.enabled_sources.includes(s.id)).length}/
                {scraperSources.length}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => selectAll('scraper')}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => deselectAll('scraper')}
              >
                Deselect All
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {scraperSources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent/50"
              >
                <Checkbox
                  id={`default-${source.id}`}
                  checked={defaults.enabled_sources.includes(source.id)}
                  onCheckedChange={() => toggleSource(source.id)}
                />
                <Label
                  htmlFor={`default-${source.id}`}
                  className="flex-1 text-sm cursor-pointer"
                >
                  {source.displayName}
                </Label>
                <div
                  className={`h-2 w-2 rounded-full ${STATUS_COLORS[source.status]}`}
                  title={source.status}
                />
              </div>
            ))}
          </div>
        </div>

        {/* B2B Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">B2B Feeds</span>
              <Badge variant="secondary" className="text-xs">
                {b2bSources.filter((s) => defaults.enabled_sources.includes(s.id)).length}/
                {b2bSources.length}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => selectAll('b2b')}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => deselectAll('b2b')}
              >
                Deselect All
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {b2bSources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent/50"
              >
                <Checkbox
                  id={`default-${source.id}`}
                  checked={defaults.enabled_sources.includes(source.id)}
                  onCheckedChange={() => toggleSource(source.id)}
                />
                <Label
                  htmlFor={`default-${source.id}`}
                  className="flex-1 text-sm cursor-pointer"
                >
                  {source.displayName}
                </Label>
                <div
                  className={`h-2 w-2 rounded-full ${STATUS_COLORS[source.status]}`}
                  title={source.status}
                />
              </div>
            ))}
            {b2bSources.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-2 py-2">
                No B2B feeds configured
              </p>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Defaults
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
