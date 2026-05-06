'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Layers, Save, RefreshCw, Cpu } from 'lucide-react';
import { AIModelCombobox } from '@/components/admin/settings/AIModelCombobox';
import { DEFAULT_AI_MODEL } from '@/lib/ai-scraping/models';

type LLMProvider = 'openai' | 'lmstudio';

interface ProviderStatus {
  provider: string;
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

interface SettingsApiResponse {
  defaults: ConsolidationDefaults;
  statuses: Record<string, ProviderStatus>;
  openai_fallback_status?: ProviderStatus;
}

interface ModelOption {
  id: string;
  label: string;
}

const DEFAULTS: ConsolidationDefaults = {
  llm_provider: 'openai',
  llm_model: DEFAULT_AI_MODEL,
  llm_base_url: null,
  llm_supports_batch_api: true,
  confidence_threshold: 0.7,
};

const EMPTY_STATUS: ProviderStatus = {
  provider: '',
  configured: false,
  last4: null,
  updated_at: null,
};

export function AIConsolidationSettingsCard() {
  // Loading state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Provider selection
  const [provider, setProvider] = useState<LLMProvider>('openai');

  // OpenAI fields
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiStatus, setOpenaiStatus] = useState<ProviderStatus>(EMPTY_STATUS);

  // LM Studio fields
  const [lmstudioBaseUrl, setLmstudioBaseUrl] = useState('');
  const [lmstudioApiKey, setLmstudioApiKey] = useState('');
  const [lmstudioStatus, setLmstudioStatus] = useState<ProviderStatus>(EMPTY_STATUS);
  const [lmstudioModels, setLmstudioModels] = useState<ModelOption[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelsFetchedOnce, setModelsFetchedOnce] = useState(false);

  // Shared defaults
  const [defaults, setDefaults] = useState<ConsolidationDefaults>(DEFAULTS);
  const [initialDefaults, setInitialDefaults] = useState<ConsolidationDefaults>(DEFAULTS);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/consolidation/settings');
      if (!res.ok) {
        throw new Error('Failed to load AI consolidation settings');
      }

      const data = (await res.json()) as SettingsApiResponse;

      const merged: ConsolidationDefaults = {
        ...DEFAULTS,
        ...data.defaults,
      };

      setDefaults(merged);
      setInitialDefaults({ ...merged });
      setProvider(merged.llm_provider ?? 'openai');

      // Set statuses
      setOpenaiStatus(data.statuses?.openai ?? EMPTY_STATUS);
      setLmstudioStatus(data.statuses?.lmstudio ?? EMPTY_STATUS);

      // Pre-fill LM Studio fields from saved config
      if (merged.llm_base_url) {
        setLmstudioBaseUrl(merged.llm_base_url.replace(/\/v1\/?$/, ''));
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

  const openaiFallbackConfigured = useMemo(() => {
    // If this is the initial defaults fetch, check the explicit fallback status
    return openaiStatus.configured;
  }, [openaiStatus.configured]);

  const hasChanges = useMemo(() => {
    if (provider === 'openai') {
      return (
        openaiApiKey.trim().length > 0 ||
        defaults.llm_model !== initialDefaults.llm_model ||
        defaults.confidence_threshold !== initialDefaults.confidence_threshold
      );
    }

    // LM Studio
    return (
      lmstudioApiKey.trim().length > 0 ||
      defaults.llm_model !== initialDefaults.llm_model ||
      (lmstudioBaseUrl.trim() && lmstudioBaseUrl.trim() !== (initialDefaults.llm_base_url?.replace(/\/v1\/?$/, '') ?? '')) ||
      defaults.confidence_threshold !== initialDefaults.confidence_threshold
    );
  }, [provider, defaults, initialDefaults, openaiApiKey, lmstudioApiKey, lmstudioBaseUrl]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (provider === 'openai') {
        const payload: Record<string, unknown> = {};
        if (openaiApiKey.trim()) {
          payload.openai_api_key = openaiApiKey.trim();
        }
        payload.defaults = {
          llm_provider: 'openai',
          llm_model: defaults.llm_model,
          confidence_threshold: defaults.confidence_threshold,
        };

        const res = await fetch('/api/admin/consolidation/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body?.error || 'Failed to save settings');
        }

        const body = (await res.json()) as { defaults?: ConsolidationDefaults; message?: string };

        // Refetch to get updated state
        await fetchConfig();
        setOpenaiApiKey('');
        setSuccessMsg(body?.message || 'OpenAI consolidation settings saved');
      } else {
        // LM Studio save
        const payload: Record<string, unknown> = {};
        if (lmstudioApiKey.trim()) {
          payload.lmstudio_api_key = lmstudioApiKey.trim();
        }
        if (openaiApiKey.trim()) {
          payload.openai_api_key = openaiApiKey.trim();
        }

        // Always send the base URL if it changed
        payload.defaults = {
          llm_provider: 'lmstudio',
          llm_model: defaults.llm_model,
          llm_base_url: lmstudioBaseUrl.trim() || null,
          confidence_threshold: defaults.confidence_threshold,
        };

        const res = await fetch('/api/admin/consolidation/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body?.error || 'Failed to save settings');
        }

        const body = (await res.json()) as { defaults?: ConsolidationDefaults; message?: string };

        // Refetch to get updated state
        await fetchConfig();
        setLmstudioApiKey('');
        setOpenaiApiKey('');
        setSuccessMsg(body?.message || 'LM Studio consolidation settings saved');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const fetchLmStudioModels = async () => {
    if (!lmstudioBaseUrl.trim()) {
      setModelError('Enter a base URL first');
      return;
    }

    setIsLoadingModels(true);
    setModelError(null);

    try {
      // Try GET first (uses saved config), fall back to POST (runtime credentials)
      let res = await fetch('/api/admin/consolidation/models');

      if (res.status === 400) {
        // POST with runtime credentials
        res = await fetch('/api/admin/consolidation/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            llm_base_url: lmstudioBaseUrl.trim(),
            api_key: lmstudioApiKey.trim() || undefined,
          }),
        });
      }

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error || 'Failed to fetch models');
      }

      const data = (await res.json()) as { models: ModelOption[] };
      setLmstudioModels(data.models ?? []);
      setModelsFetchedOnce(true);

      // If current model is not in the list, clear it
      if (data.models.length > 0 && !data.models.find((m) => m.id === defaults.llm_model)) {
        setDefaults((prev) => ({ ...prev, llm_model: data.models[0].id }));
      }
    } catch (e) {
      setModelError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Auto-fetch models when switching to LM Studio if base URL is set
  useEffect(() => {
    if (provider === 'lmstudio' && lmstudioBaseUrl.trim() && !modelsFetchedOnce && !isLoadingModels) {
      void fetchLmStudioModels();
    }
  }, [provider]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-none bg-brand-forest-green border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <Layers className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle>AI Consolidation Settings</CardTitle>
            <CardDescription>
              Configure the AI provider for product consolidation. Records are submitted in batches and
              normalized for ShopSite export. OpenAI Batch is the default. LM Studio Direct Chat is
              available for local LLM inference.
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
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}
            {successMsg && (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{successMsg}</div>
            )}

            {/* Provider Selector */}
            <div className="space-y-3">
              <Label>AI Provider</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  className={`flex flex-1 items-center gap-3 rounded-md border-2 p-4 text-left transition-colors ${
                    provider === 'openai'
                      ? 'border-brand-forest-green bg-brand-forest-green/5'
                      : 'border-muted bg-background hover:border-muted-foreground/30'
                  }`}
                  onClick={() => {
                    setProvider('openai');
                    setModelError(null);
                  }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-emerald-100">
                    <Layers className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div>
                    <div className="font-medium">OpenAI Batch</div>
                    <div className="text-xs text-muted-foreground">
                      Async batch processing via OpenAI API
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`flex flex-1 items-center gap-3 rounded-md border-2 p-4 text-left transition-colors ${
                    provider === 'lmstudio'
                      ? 'border-brand-forest-green bg-brand-forest-green/5'
                      : 'border-muted bg-background hover:border-muted-foreground/30'
                  }`}
                  onClick={() => {
                    setProvider('lmstudio');
                    setModelError(null);
                  }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-violet-100">
                    <Cpu className="h-4 w-4 text-violet-700" />
                  </div>
                  <div>
                    <div className="font-medium">LM Studio Direct Chat</div>
                    <div className="text-xs text-muted-foreground">
                      Direct chat completions via self-hosted LM Studio
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Provider-specific Fields */}
            {provider === 'openai' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="consolidation-openai-key">OpenAI API Key</Label>
                  <Input
                    id="consolidation-openai-key"
                    type="password"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                  <div className="text-xs text-muted-foreground">
                    {openaiStatus.configured
                      ? `Configured (ending in ${openaiStatus.last4 ?? '****'})`
                      : 'Required for batch consolidation'}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="consolidation-openai-model">Model</Label>
                  <AIModelCombobox
                    id="consolidation-openai-model"
                    value={defaults.llm_model}
                    onChange={(value) =>
                      setDefaults((prev) => ({ ...prev, llm_model: value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="consolidation-openai-confidence">
                    Confidence Threshold
                  </Label>
                  <Input
                    id="consolidation-openai-confidence"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={defaults.confidence_threshold}
                    onChange={(e) =>
                      setDefaults((prev) => ({
                        ...prev,
                        confidence_threshold: Number(e.target.value) || 0.7,
                      }))
                    }
                  />
                </div>

                <div className="flex items-end space-y-2">
                  <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground w-full">
                    <span className="font-medium text-emerald-600">Batch API</span> — Products are
                    submitted as a batch and processed asynchronously by OpenAI. Best for large
                    product sets.
                  </div>
                </div>
              </div>
            ) : (
              /* LM Studio section */
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="consolidation-lmstudio-url">
                      LM Studio Base URL
                    </Label>
                    <Input
                      id="consolidation-lmstudio-url"
                      type="url"
                      value={lmstudioBaseUrl}
                      onChange={(e) => {
                        setLmstudioBaseUrl(e.target.value);
                        setModelsFetchedOnce(false);
                      }}
                      placeholder="https://your-server:1234"
                    />
                    <div className="text-xs text-muted-foreground">
                      Your publicly-accessible LM Studio endpoint. The &ldquo;/v1&rdquo; suffix is
                      appended automatically.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="consolidation-lmstudio-key">
                      LM Studio API Key
                    </Label>
                    <Input
                      id="consolidation-lmstudio-key"
                      type="password"
                      value={lmstudioApiKey}
                      onChange={(e) => setLmstudioApiKey(e.target.value)}
                      placeholder="Optional API key"
                    />
                    <div className="text-xs text-muted-foreground">
                      {lmstudioStatus.configured
                        ? `Configured (ending in ${lmstudioStatus.last4 ?? '****'})`
                        : 'Set in LM Studio server settings if required'}
                    </div>
                  </div>
                </div>

                {/* Model Fetch Row */}
                <div className="space-y-2">
                  <Label>Model</Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <AIModelCombobox
                        id="consolidation-lmstudio-model"
                        value={defaults.llm_model}
                        onChange={(value) =>
                          setDefaults((prev) => ({ ...prev, llm_model: value }))
                        }
                        options={lmstudioModels}
                        placeholder={lmstudioModels.length === 0 ? 'Fetch models first...' : undefined}
                        emptyLabel={
                          lmstudioModels.length === 0 && modelsFetchedOnce
                            ? 'No models returned by the endpoint'
                            : 'No models found.'
                        }
                        searchPlaceholder="Search models..."
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={fetchLmStudioModels}
                      disabled={isLoadingModels || !lmstudioBaseUrl.trim()}
                    >
                      {isLoadingModels ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-2 hidden sm:inline">
                        {isLoadingModels ? 'Fetching...' : 'Fetch Models'}
                      </span>
                    </Button>
                  </div>
                  {modelError && (
                    <div className="text-xs text-red-500">{modelError}</div>
                  )}
                  {lmstudioModels.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {lmstudioModels.length} model{lmstudioModels.length !== 1 ? 's' : ''} available
                    </div>
                  )}
                </div>

                {/* Confidence Threshold */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="consolidation-lmstudio-confidence">
                      Confidence Threshold
                    </Label>
                    <Input
                      id="consolidation-lmstudio-confidence"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={defaults.confidence_threshold}
                      onChange={(e) =>
                        setDefaults((prev) => ({
                          ...prev,
                          confidence_threshold: Number(e.target.value) || 0.7,
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-end space-y-2">
                    <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground w-full">
                      <span className="font-medium text-violet-600">Direct Chat</span> — Each product
                      is sent as a chat completion. Processes one at a time via status polling. Slower
                      but keeps data on your infrastructure.
                    </div>
                  </div>
                </div>

                {/* Fallback notice */}
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
                  <strong>Automatic Fallback:</strong> If LM Studio is unreachable when a batch is
                  submitted, the system will automatically fall back to OpenAI Batch API using the
                  saved OpenAI key.{' '}
                  {openaiFallbackConfigured ? (
                    <span className="text-emerald-700">
                      OpenAI fallback key is configured (ending in {openaiStatus.last4}).
                    </span>
                  ) : (
                    <span className="text-red-600">
                      No OpenAI fallback key is configured. Add one below or batches will fail if LM
                      Studio is offline.
                    </span>
                  )}
                </div>

                {/* OpenAI Fallback Key Input */}
                <div className="border-t pt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="consolidation-openai-fallback-key">
                        OpenAI Fallback API Key
                      </Label>
                      <Input
                        id="consolidation-openai-fallback-key"
                        type="password"
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        placeholder="sk-... (optional, for fallback)"
                      />
                      <div className="text-xs text-muted-foreground">
                        {openaiFallbackConfigured
                          ? `Configured (ending in ${openaiStatus.last4 ?? '****'})`
                          : 'Recommended for automatic fallback if LM Studio is offline'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save & Refresh */}
            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    (provider === 'openai' && openaiStatus.configured) ||
                    (provider === 'lmstudio' && lmstudioStatus.configured)
                      ? 'default'
                      : 'secondary'
                  }
                >
                  {provider === 'openai' ? 'OpenAI Batch' : 'LM Studio Direct'}
                  {' '}
                  {provider === 'openai'
                    ? openaiStatus.configured
                      ? 'Ready'
                      : 'Not Configured'
                    : lmstudioStatus.configured
                      ? 'Ready'
                      : 'Not Configured'}
                </Badge>
                {provider === 'lmstudio' && (
                  <Badge variant="outline">
                    Batch API: Disabled
                  </Badge>
                )}
                {provider === 'openai' && (
                  <Badge variant="outline">
                    Batch API: Enabled
                  </Badge>
                )}
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
                      Save Settings
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
