'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, Save, RefreshCw } from 'lucide-react';

interface ProviderStatus {
  provider: 'openai' | 'brave';
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}

interface ScrapingDefaults {
  llm_model: 'gpt-4o-mini' | 'gpt-4o';
  max_search_results: number;
  max_steps: number;
  confidence_threshold: number;
}

interface ApiResponse {
  statuses: Record<'openai' | 'brave', ProviderStatus>;
  defaults: ScrapingDefaults;
}

const DEFAULTS: ScrapingDefaults = {
  llm_model: 'gpt-4o-mini',
  max_search_results: 5,
  max_steps: 15,
  confidence_threshold: 0.7,
};

export function AIScrapingSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [braveApiKey, setBraveApiKey] = useState('');
  const [statuses, setStatuses] = useState<Record<'openai' | 'brave', ProviderStatus>>({
    openai: { provider: 'openai', configured: false, last4: null, updated_at: null },
    brave: { provider: 'brave', configured: false, last4: null, updated_at: null },
  });
  const [defaults, setDefaults] = useState<ScrapingDefaults>(DEFAULTS);
  const [initialDefaults, setInitialDefaults] = useState<ScrapingDefaults>(DEFAULTS);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ai-scraping/credentials');
      if (!res.ok) {
        throw new Error('Failed to load AI scraping settings');
      }

      const data = (await res.json()) as ApiResponse;
      setStatuses(data.statuses);
      setDefaults(data.defaults);
      setInitialDefaults(data.defaults);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfig();
  }, []);

  const hasChanges = useMemo(() => {
    return (
      openaiApiKey.trim().length > 0 ||
      braveApiKey.trim().length > 0 ||
      defaults.llm_model !== initialDefaults.llm_model ||
      defaults.max_search_results !== initialDefaults.max_search_results ||
      defaults.max_steps !== initialDefaults.max_steps ||
      defaults.confidence_threshold !== initialDefaults.confidence_threshold
    );
  }, [openaiApiKey, braveApiKey, defaults, initialDefaults]);

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        openai_api_key: openaiApiKey.trim() || undefined,
        brave_api_key: braveApiKey.trim() || undefined,
        defaults,
      };

      const res = await fetch('/api/admin/ai-scraping/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.details || body?.error || 'Failed to save settings');
      }

      const body = (await res.json()) as { statuses: ApiResponse['statuses']; defaults: ScrapingDefaults };
      setStatuses(body.statuses);
      setDefaults(body.defaults);
      setInitialDefaults(body.defaults);
      setOpenaiApiKey('');
      setBraveApiKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
            <Bot className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <CardTitle>AI Scraping Settings</CardTitle>
            <CardDescription>
              Configure OpenAI and Brave keys for runner-dispatched AI scraping jobs, and set scraping models.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="openai-api-key">OpenAI API Key</Label>
                <Input
                  id="openai-api-key"
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                />
                <div className="text-xs text-muted-foreground">
                  {statuses.openai.configured
                    ? `Configured (ending in ${statuses.openai.last4 ?? '****'})`
                    : 'Not configured'}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="brave-api-key">Brave Search API Key</Label>
                <Input
                  id="brave-api-key"
                  type="password"
                  value={braveApiKey}
                  onChange={(e) => setBraveApiKey(e.target.value)}
                  placeholder="BSA..."
                />
                <div className="text-xs text-muted-foreground">
                  {statuses.brave.configured
                    ? `Configured (ending in ${statuses.brave.last4 ?? '****'})`
                    : 'Not configured'}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="scraping-ai-model">Scraping Model</Label>
                <select
                  id="scraping-ai-model"
                  value={defaults.llm_model}
                  onChange={(e) =>
                    setDefaults((prev) => ({ ...prev, llm_model: e.target.value as ScrapingDefaults['llm_model'] }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-search-results">Max Search Results</Label>
                <Input
                  id="max-search-results"
                  type="number"
                  min={1}
                  max={10}
                  value={defaults.max_search_results}
                  onChange={(e) =>
                    setDefaults((prev) => ({ ...prev, max_search_results: Number(e.target.value) || 5 }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-steps">Max Steps</Label>
                <Input
                  id="max-steps"
                  type="number"
                  min={1}
                  max={50}
                  value={defaults.max_steps}
                  onChange={(e) =>
                    setDefaults((prev) => ({ ...prev, max_steps: Number(e.target.value) || 15 }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scraping-confidence-threshold">Confidence Threshold</Label>
                <Input
                  id="scraping-confidence-threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={defaults.confidence_threshold}
                  onChange={(e) =>
                    setDefaults((prev) => ({ ...prev, confidence_threshold: Number(e.target.value) || 0.7 }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex gap-2">
                <Badge variant={statuses.openai.configured ? 'default' : 'secondary'}>
                  OpenAI {statuses.openai.configured ? 'Ready' : 'Missing'}
                </Badge>
                <Badge variant={statuses.brave.configured ? 'default' : 'secondary'}>
                  Brave {statuses.brave.configured ? 'Ready' : 'Missing'}
                </Badge>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchConfig} disabled={loading || saving}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <Button onClick={onSave} disabled={saving || !hasChanges}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Scraping Settings
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
