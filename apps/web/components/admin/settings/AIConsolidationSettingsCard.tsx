'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Layers, Save, RefreshCw } from 'lucide-react';

interface ProviderStatus {
  provider: string;
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}

interface ConsolidationDefaults {
  llm_provider: 'gemini';
  llm_model: string;
  llm_base_url: string | null;
  llm_supports_batch_api: boolean;
  confidence_threshold: number;
}

interface ApiResponse {
  statuses: {
    gemini: ProviderStatus;
  };
  consolidationDefaults: ConsolidationDefaults;
}

const DEFAULTS: ConsolidationDefaults = {
  llm_provider: 'gemini',
  llm_model: 'gemini-2.5-flash',
  llm_base_url: null,
  llm_supports_batch_api: true,
  confidence_threshold: 0.7,
};

const EMPTY_GEMINI_STATUS: ProviderStatus = {
  provider: 'gemini',
  configured: false,
  last4: null,
  updated_at: null,
};

export function AIConsolidationSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiStatus, setGeminiStatus] = useState<ProviderStatus>(EMPTY_GEMINI_STATUS);
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
      setGeminiStatus(data.statuses.gemini ?? EMPTY_GEMINI_STATUS);
      setDefaults({
        ...DEFAULTS,
        ...data.consolidationDefaults,
        llm_provider: 'gemini',
        llm_base_url: null,
        llm_supports_batch_api: true,
      });
      setInitialDefaults({
        ...DEFAULTS,
        ...data.consolidationDefaults,
        llm_provider: 'gemini',
        llm_base_url: null,
        llm_supports_batch_api: true,
      });
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
      geminiApiKey.trim().length > 0 ||
      defaults.llm_model !== initialDefaults.llm_model ||
      defaults.confidence_threshold !== initialDefaults.confidence_threshold
    );
  }, [defaults, geminiApiKey, initialDefaults]);

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        gemini_api_key: geminiApiKey.trim() || undefined,
        consolidationDefaults: {
          ...defaults,
          llm_provider: 'gemini' as const,
          llm_base_url: null,
          llm_supports_batch_api: true,
        },
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

      setGeminiStatus(body.statuses.gemini ?? EMPTY_GEMINI_STATUS);
      setDefaults({
        ...DEFAULTS,
        ...body.consolidationDefaults,
        llm_provider: 'gemini',
        llm_base_url: null,
        llm_supports_batch_api: true,
      });
      setInitialDefaults({
        ...DEFAULTS,
        ...body.consolidationDefaults,
        llm_provider: 'gemini',
        llm_base_url: null,
        llm_supports_batch_api: true,
      });
      setGeminiApiKey('');
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
              Consolidation now submits directly to Gemini batch processing. The
              OpenAI migration is complete, so only the shared Gemini API key
              and default Gemini model are configurable here.
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
                <Label htmlFor="consolidation-gemini-key">Gemini API Key</Label>
                <Input
                  id="consolidation-gemini-key"
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIza..."
                />
                <div className="text-xs text-muted-foreground">
                  {geminiStatus.configured
                    ? `Configured (ending in ${geminiStatus.last4 ?? '****'})`
                    : 'Required for batch consolidation'}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="consolidation-ai-model">Gemini Model</Label>
                <Input
                  id="consolidation-ai-model"
                  value={defaults.llm_model}
                  onChange={(e) =>
                    setDefaults((prev) => ({ ...prev, llm_model: e.target.value }))
                  }
                  placeholder="gemini-2.5-flash"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
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
                    setDefaults((prev) => ({
                      ...prev,
                      confidence_threshold: Number(e.target.value) || 0.7,
                    }))
                  }
                />
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
              Gemini batch support is always enabled for consolidation jobs in this environment.
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex gap-2">
                <Badge variant={geminiStatus.configured ? 'default' : 'secondary'}>
                  Gemini Batch {geminiStatus.configured ? 'Ready' : 'Missing'}
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
