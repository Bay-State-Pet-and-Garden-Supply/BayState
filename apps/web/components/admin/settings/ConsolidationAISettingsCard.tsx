'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, ShieldAlert, CheckCircle, HelpCircle, Brain, Bot, Cpu, Globe } from 'lucide-react';
import { AIModelCombobox } from '@/components/admin/settings/AIModelCombobox';
import { adminFetch } from '@/lib/admin/api-client';

interface ConsolidationRuntime {
  provider: string;
  model: string;
  base_url: string | null;
  confidence_threshold: number;
  llm_supports_batch_api: boolean;
  config_id: string | null;
}

interface ActiveConsolidationConfig {
  id: string;
  name: string;
  provider_type: string;
  default_model: string;
}

interface ConsolidationSettingsData {
  defaults: {
    llm_provider: string;
    llm_model: string;
    llm_base_url: string | null;
    confidence_threshold: number;
    llm_supports_batch_api: boolean;
  };
  runtime: ConsolidationRuntime | null;
  active_consolidation_config: ActiveConsolidationConfig | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  openai_compatible: 'OpenAI Compatible',
  gemini: 'Gemini',
  lmstudio: 'LM Studio',
};

export function ConsolidationAISettingsCard() {
  const [data, setData] = useState<ConsolidationSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable fields
  const [formModel, setFormModel] = useState('');
  const [saving, setSaving] = useState(false);

  // Model options derived from current provider
  const [modelOptions, setModelOptions] = useState<{ id: string; label?: string }[]>([]);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('/api/admin/consolidation/settings');
      if (!res.ok) throw new Error('Failed to load consolidation settings');
      const result = await res.json();
      setData(result);
      setFormModel(result.defaults?.llm_model || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  // Populate model options when data loads
  useEffect(() => {
    if (!data?.runtime) return;
    const provider = data.runtime.provider;
    const options: { id: string; label?: string }[] = [];

    if (provider === 'gemini') {
      options.push(
        { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      );
    } else if (provider === 'openai') {
      options.push(
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { id: 'gpt-4o', label: 'GPT-4o' },
      );
    } else {
      options.push(
        { id: 'deepseek-chat', label: 'DeepSeek Chat' },
        { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
      );
    }

    setModelOptions(options);
  }, [data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formModel.trim()) {
      setError('Please select a model.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await adminFetch('/api/admin/consolidation/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaults: {
            llm_model: formModel.trim(),
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error || 'Failed to save consolidation settings');
      }

      await fetchSettings();
      setSuccess(`Consolidation model updated to ${formModel.trim()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const runtime = data?.runtime;
  const activeConfig = data?.active_consolidation_config;
  const provider = runtime?.provider || data?.defaults?.llm_provider || 'deepseek';
  const model = runtime?.model || data?.defaults?.llm_model || 'deepseek-chat';
  const isBatchApi = runtime?.llm_supports_batch_api;

  return (
    <Card className="border border-border bg-card shadow-sm rounded-none">
      <CardHeader className="border-b border-border bg-muted/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-none bg-brand-burgundy border border-border">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-brand-burgundy">Consolidation AI Settings</CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Configure which model is used for product consolidation (merging). The provider is determined by the profile assigned to consolidation in AI Provider Profiles above.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-5">
        {error && (
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3.5 rounded-none font-medium animate-in fade-in duration-200">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Error</p>
              <p className="opacity-90">{error}</p>
            </div>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs p-3.5 rounded-none font-medium animate-in fade-in duration-200">
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-bold">Success</p>
              <p className="opacity-90">{success}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            {/* Active Configuration Status */}
            <div className="rounded-none border border-border bg-muted/10 p-4 space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Configuration
              </Label>

              {/* Provider + Profile */}
              <div className="flex flex-wrap items-center gap-3">
                {activeConfig ? (
                  <>
                    <Badge className="rounded-none bg-brand-burgundy/10 text-brand-burgundy border border-brand-burgundy/20 text-[10px] px-2 py-0.5 font-semibold flex items-center gap-1">
                      <Bot className="h-3 w-3" />
                      {activeConfig.name}
                    </Badge>
                    <Badge variant="outline" className="rounded-none bg-muted/40 border-border text-[9px] px-1.5 py-0 font-semibold">
                      {PROVIDER_LABELS[activeConfig.provider_type] || activeConfig.provider_type}
                    </Badge>
                  </>
                ) : (
                  <Badge variant="outline" className="rounded-none bg-muted/40 border-dashed text-muted-foreground text-[9px] px-1.5 py-0 font-semibold">
                    No consolidation profile assigned
                  </Badge>
                )}
                <Badge
                  className={`rounded-none text-[9px] px-1.5 py-0 font-semibold ${
                    isBatchApi
                      ? 'bg-blue-600/10 text-blue-700 border border-blue-200'
                      : 'bg-violet-600/10 text-violet-700 border border-violet-200'
                  }`}
                >
                  {isBatchApi ? 'Batch API' : 'Direct item processing'}
                </Badge>
              </div>

              {/* Runtime summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="rounded-none border border-border bg-background px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">
                    {PROVIDER_LABELS[provider] || provider}
                  </p>
                </div>
                <div className="rounded-none border border-border bg-background px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Model</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5 font-mono">{model}</p>
                </div>
                <div className="rounded-none border border-border bg-background px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Confidence Threshold</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">
                    {runtime?.confidence_threshold != null
                      ? `${Math.round(runtime.confidence_threshold * 100)}%`
                      : '70%'}
                  </p>
                </div>
              </div>

              {runtime?.base_url && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
                  <Globe className="h-3 w-3" />
                  <span className="truncate">{runtime.base_url}</span>
                </div>
              )}
            </div>

            {/* Model Selection */}
            <form onSubmit={handleSave} className="space-y-4">
              <div className="rounded-none border border-border bg-muted/10 p-4 space-y-3">
                <Label htmlFor="consolidation-model" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" />
                  Consolidation Model Override
                </Label>
                <p className="text-[10px] text-muted-foreground/80 leading-normal">
                  Override the default model used for consolidation. This applies on top of the assigned consolidation provider profile.
                </p>
                <div className="flex gap-2 max-w-md">
                  <div className="flex-1">
                    <AIModelCombobox
                      id="consolidation-model"
                      value={formModel}
                      options={modelOptions.length > 0 ? modelOptions : undefined}
                      placeholder="Select a model"
                      emptyLabel="Type a custom model name"
                      onChange={(value) => setFormModel(value)}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={saving}
                    className="rounded-none h-9 text-xs font-semibold bg-brand-burgundy hover:bg-brand-burgundy/90 text-white gap-1.5 shrink-0"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>

            {/* Info callout */}
            <div className="flex items-start gap-2 rounded-none border border-blue-200 bg-blue-50/60 px-3 py-2.5">
              <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
              <div className="text-[10px] text-blue-800 leading-normal">
                <p className="font-semibold">How consolidation model selection works</p>
                <p className="mt-0.5 opacity-80">
                  The consolidation provider is determined by the profile marked as &quot;Active for Consolidation&quot; in AI Provider Profiles above.
                  The model set here overrides that profile&apos;s default model. If no consolidation profile is assigned, the extraction profile is used as fallback.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
