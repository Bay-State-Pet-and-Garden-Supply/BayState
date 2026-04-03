'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Layers, Save, RefreshCw } from 'lucide-react';

type ProviderName = 'openai' | 'openai_compatible' | 'serpapi' | 'brave';
type LLMProvider = 'openai' | 'openai_compatible';

interface ProviderStatus {
  provider: ProviderName;
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}

interface ConsolidationDefaults {
  llm_provider: LLMProvider;
  llm_model: string;
  llm_base_url: string | null;
  llm_supports_batch_api: boolean;
  confidence_threshold: number;
}

interface ApiResponse {
  statuses: Record<ProviderName, ProviderStatus>;
  consolidationDefaults: ConsolidationDefaults;
}

const DEFAULTS: ConsolidationDefaults = {
  llm_provider: 'openai',
  llm_model: 'gpt-4o-mini',
  llm_base_url: null,
  llm_supports_batch_api: true,
  confidence_threshold: 0.7,
};

export function AIConsolidationSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openAICompatibleApiKey, setOpenAICompatibleApiKey] = useState('');
  const [statuses, setStatuses] = useState<Record<ProviderName, ProviderStatus>>({
    openai: { provider: 'openai', configured: false, last4: null, updated_at: null },
    openai_compatible: { provider: 'openai_compatible', configured: false, last4: null, updated_at: null },
    serpapi: { provider: 'serpapi', configured: false, last4: null, updated_at: null },
    brave: { provider: 'brave', configured: false, last4: null, updated_at: null },
  });
  const [defaults, setDefaults] = useState<ConsolidationDefaults>(DEFAULTS);
  const [initialDefaults, setInitialDefaults] = useState<ConsolidationDefaults>(DEFAULTS);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ai-scraping/credentials');
      if (!res.ok) {
        throw new Error('Failed to load AI consolidation settings');
      }

      const data = (await res.json()) as ApiResponse;
      setStatuses(data.statuses);
      if (data.consolidationDefaults) {
        setDefaults(data.consolidationDefaults);
        setInitialDefaults(data.consolidationDefaults);
      }
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
      openAICompatibleApiKey.trim().length > 0 ||
      defaults.llm_provider !== initialDefaults.llm_provider ||
      defaults.llm_model !== initialDefaults.llm_model ||
      (defaults.llm_base_url || '') !== (initialDefaults.llm_base_url || '') ||
      defaults.llm_supports_batch_api !== initialDefaults.llm_supports_batch_api ||
      defaults.confidence_threshold !== initialDefaults.confidence_threshold
    );
  }, [defaults, initialDefaults, openaiApiKey, openAICompatibleApiKey]);

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        openai_api_key: openaiApiKey.trim() || undefined,
        openai_compatible_api_key: openAICompatibleApiKey.trim() || undefined,
        consolidationDefaults: defaults,
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

      const body = (await res.json()) as {
        statuses: ApiResponse['statuses'];
        consolidationDefaults: ConsolidationDefaults;
      };
      if (body.statuses) {
        setStatuses(body.statuses);
      }
      if (body.consolidationDefaults) {
        setDefaults(body.consolidationDefaults);
        setInitialDefaults(body.consolidationDefaults);
      }
      setOpenaiApiKey('');
      setOpenAICompatibleApiKey('');
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <Layers className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <CardTitle>AI Consolidation Settings</CardTitle>
            <CardDescription>
              Configure the provider used for product consolidation. The current
              batch workflow requires an endpoint that supports OpenAI-style
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">/files</code>
              and
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">/batches</code>.
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
                <Label htmlFor="consolidation-openai-key">OpenAI API Key</Label>
                <Input
                  id="consolidation-openai-key"
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
                <Label htmlFor="consolidation-openai-compatible-key">
                  OpenAI-Compatible Endpoint Key
                </Label>
                <Input
                  id="consolidation-openai-compatible-key"
                  type="password"
                  value={openAICompatibleApiKey}
                  onChange={(e) => setOpenAICompatibleApiKey(e.target.value)}
                  placeholder="Optional bearer token"
                />
                <div className="text-xs text-muted-foreground">
                  {statuses.openai_compatible.configured
                    ? `Configured (ending in ${statuses.openai_compatible.last4 ?? '****'})`
                    : 'Optional for self-hosted endpoints'}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="consolidation-llm-provider">LLM Provider</Label>
                <select
                  id="consolidation-llm-provider"
                  value={defaults.llm_provider}
                  onChange={(e) =>
                    setDefaults((prev) => ({
                      ...prev,
                      llm_provider: e.target.value as LLMProvider,
                      llm_base_url:
                        e.target.value === 'openai_compatible' ? prev.llm_base_url : null,
                      llm_supports_batch_api:
                        e.target.value === 'openai'
                          ? true
                          : prev.llm_supports_batch_api,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="openai">OpenAI</option>
                  <option value="openai_compatible">Self-hosted / OpenAI-compatible</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="consolidation-ai-model">Consolidation Model</Label>
                <Input
                  id="consolidation-ai-model"
                  value={defaults.llm_model}
                  onChange={(e) =>
                    setDefaults((prev) => ({ ...prev, llm_model: e.target.value }))
                  }
                  placeholder={
                    defaults.llm_provider === 'openai'
                      ? 'gpt-4o-mini'
                      : 'google/gemma-4-31B-it'
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="consolidation-llm-base-url">LLM Base URL</Label>
                <Input
                  id="consolidation-llm-base-url"
                  value={defaults.llm_base_url || ''}
                  onChange={(e) =>
                    setDefaults((prev) => ({
                      ...prev,
                      llm_base_url: e.target.value.trim() || null,
                    }))
                  }
                  placeholder="http://localhost:8000/v1"
                  disabled={defaults.llm_provider !== 'openai_compatible'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="consolidation-confidence-threshold">
                  Confidence Threshold
                </Label>
                <Input
                  id="consolidation-confidence-threshold"
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

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="consolidation-batch-capability"
                  checked={defaults.llm_supports_batch_api}
                  onCheckedChange={(checked) =>
                    setDefaults((prev) => ({
                      ...prev,
                      llm_supports_batch_api: !!checked,
                    }))
                  }
                  disabled={defaults.llm_provider === 'openai'}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="consolidation-batch-capability">
                    Endpoint supports OpenAI Batch API
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Leave this off for vLLM, Ollama, and TGI unless you are
                    routing through a gateway that exposes compatible batch
                    endpoints. The current consolidation workflow will refuse to
                    submit batch jobs when this is disabled.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex gap-2">
                <Badge variant={statuses.openai.configured ? 'default' : 'secondary'}>
                  OpenAI {statuses.openai.configured ? 'Ready' : 'Missing'}
                </Badge>
                <Badge
                  variant={
                    defaults.llm_provider === 'openai_compatible' &&
                    (!defaults.llm_base_url || !statuses.openai_compatible.configured)
                      ? 'secondary'
                      : 'default'
                  }
                >
                  Local Batch{' '}
                  {defaults.llm_provider === 'openai_compatible'
                    ? defaults.llm_supports_batch_api
                      ? 'Enabled'
                      : 'Disabled'
                    : 'Optional'}
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
                      Save Consolidation Settings
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
