"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bot, Save, RefreshCw, Key, Settings, Globe } from "lucide-react";
import { AIModelCombobox } from "@/components/admin/settings/AIModelCombobox";
import { DEFAULT_AI_MODEL } from "@/lib/ai-scraping/models";
import { adminFetch } from '@/lib/admin/api-client';

interface ProviderStatus {
  provider: string;
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}

interface ScrapingDefaults {
  llm_provider: "deepseek" | "openai" | "openai_compatible" | "gemini" | "lmstudio";
  llm_model: string;
  llm_base_url: string | null;
  max_search_results: number;
  max_steps: number;
  confidence_threshold: number;
}

interface ApiResponse {
  statuses: Record<string, ProviderStatus | undefined>;
  defaults: ScrapingDefaults;
}

const DEFAULTS: ScrapingDefaults = {
  llm_provider: "deepseek",
  llm_model: DEFAULT_AI_MODEL,
  llm_base_url: null,
  max_search_results: 5,
  max_steps: 15,
  confidence_threshold: 0.7,
};

const EMPTY_STATUSES: Record<string, ProviderStatus> = {
  deepseek: { provider: "deepseek", configured: false, last4: null, updated_at: null },
  gemini: { provider: "gemini", configured: false, last4: null, updated_at: null },
  openai: { provider: "openai", configured: false, last4: null, updated_at: null },
  lmstudio: { provider: "lmstudio", configured: false, last4: null, updated_at: null },
  openai_compatible: { provider: "openai_compatible", configured: false, last4: null, updated_at: null },
  serpapi: { provider: "serpapi", configured: false, last4: null, updated_at: null },
};

export function AIScrapingSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // API Key inputs
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [lmstudioApiKey, setLmstudioApiKey] = useState("");
  const [openaiCompatibleApiKey, setOpenaiCompatibleApiKey] = useState("");
  const [serperApiKey, setSerperApiKey] = useState("");

  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>(EMPTY_STATUSES);
  const [defaults, setDefaults] = useState<ScrapingDefaults>(DEFAULTS);
  const [initialDefaults, setInitialDefaults] = useState<ScrapingDefaults>(DEFAULTS);

  // Models cache
  const [fetchedModels, setFetchedModels] = useState<{ id: string; label?: string }[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await adminFetch("/api/admin/ai-scraping/credentials");
      if (!res.ok) {
        throw new Error("Failed to load AI scraping settings");
      }

      const data = (await res.json()) as ApiResponse;
      setStatuses({
        deepseek: data.statuses.deepseek ?? EMPTY_STATUSES.deepseek,
        gemini: data.statuses.gemini ?? EMPTY_STATUSES.gemini,
        openai: data.statuses.openai ?? EMPTY_STATUSES.openai,
        lmstudio: data.statuses.lmstudio ?? EMPTY_STATUSES.lmstudio,
        openai_compatible: data.statuses.openai_compatible ?? EMPTY_STATUSES.openai_compatible,
        serpapi: data.statuses.serpapi ?? EMPTY_STATUSES.serpapi,
      });
      setDefaults({
        ...DEFAULTS,
        ...data.defaults,
      });
      setInitialDefaults({
        ...DEFAULTS,
        ...data.defaults,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const getActiveApiKey = (provider: string): string => {
    if (provider === "deepseek") return deepseekApiKey;
    if (provider === "gemini") return geminiApiKey;
    if (provider === "openai") return openaiApiKey;
    if (provider === "lmstudio") return lmstudioApiKey;
    if (provider === "openai_compatible") return openaiCompatibleApiKey;
    return "";
  };

  const loadModelsList = async (provider: string, baseUrl: string | null, activeKey: string) => {
    setFetchingModels(true);
    try {
      const params = new URLSearchParams();
      params.set("provider", provider);
      if (baseUrl) {
        params.set("base_url", baseUrl);
      }
      if (activeKey.trim()) {
        params.set("api_key", activeKey.trim());
      }
      const res = await adminFetch(`/api/admin/ai-scraping/models?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.models)) {
          setFetchedModels(data.models.map((m: any) => ({
            id: m.id,
            label: m.id,
          })));
        } else {
          setFetchedModels([]);
        }
      } else {
        setFetchedModels([]);
      }
    } catch (e) {
      console.error("Failed to load models list:", e);
      setFetchedModels([]);
    } finally {
      setFetchingModels(false);
    }
  };

  useEffect(() => {
    void fetchConfig();
  }, []);

  // Dynamically load model list on provider or base url change
  useEffect(() => {
    if (!loading) {
      const activeKey = getActiveApiKey(defaults.llm_provider);
      void loadModelsList(defaults.llm_provider, defaults.llm_base_url, activeKey);
    }
  }, [defaults.llm_provider, defaults.llm_base_url, loading]);

  const hasChanges = useMemo(() => {
    return (
      geminiApiKey.trim().length > 0 ||
      deepseekApiKey.trim().length > 0 ||
      openaiApiKey.trim().length > 0 ||
      lmstudioApiKey.trim().length > 0 ||
      openaiCompatibleApiKey.trim().length > 0 ||
      serperApiKey.trim().length > 0 ||
      defaults.llm_provider !== initialDefaults.llm_provider ||
      defaults.llm_model !== initialDefaults.llm_model ||
      defaults.llm_base_url !== initialDefaults.llm_base_url ||
      defaults.max_search_results !== initialDefaults.max_search_results ||
      defaults.max_steps !== initialDefaults.max_steps ||
      defaults.confidence_threshold !== initialDefaults.confidence_threshold
    );
  }, [
    defaults,
    geminiApiKey,
    deepseekApiKey,
    openaiApiKey,
    lmstudioApiKey,
    openaiCompatibleApiKey,
    serperApiKey,
    initialDefaults,
  ]);

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        gemini_api_key: geminiApiKey.trim() || undefined,
        deepseek_api_key: deepseekApiKey.trim() || undefined,
        openai_api_key: openaiApiKey.trim() || undefined,
        lmstudio_api_key: lmstudioApiKey.trim() || undefined,
        openai_compatible_api_key: openaiCompatibleApiKey.trim() || undefined,
        serper_api_key: serperApiKey.trim() || undefined,
        defaults: {
          ...defaults,
        },
      };

      const res = await adminFetch("/api/admin/ai-scraping/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(
          body?.details || body?.error || "Failed to save settings",
        );
      }

      const body = (await res.json()) as {
        statuses: ApiResponse["statuses"];
        defaults: ScrapingDefaults;
      };

      setStatuses({
        deepseek: body.statuses.deepseek ?? EMPTY_STATUSES.deepseek,
        gemini: body.statuses.gemini ?? EMPTY_STATUSES.gemini,
        openai: body.statuses.openai ?? EMPTY_STATUSES.openai,
        lmstudio: body.statuses.lmstudio ?? EMPTY_STATUSES.lmstudio,
        openai_compatible: body.statuses.openai_compatible ?? EMPTY_STATUSES.openai_compatible,
        serpapi: body.statuses.serpapi ?? EMPTY_STATUSES.serpapi,
      });
      setDefaults({
        ...DEFAULTS,
        ...body.defaults,
      });
      setInitialDefaults({
        ...DEFAULTS,
        ...body.defaults,
      });
      setGeminiApiKey("");
      setDeepseekApiKey("");
      setOpenaiApiKey("");
      setLmstudioApiKey("");
      setOpenaiCompatibleApiKey("");
      setSerperApiKey("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-none bg-brand-gold border border-border">
            <Bot className="h-5 w-5 text-brand-burgundy" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold tracking-tight text-brand-burgundy">
              AI Scraping Settings
            </CardTitle>
            <CardDescription className="text-sm">
              Configure LLM providers, custom endpoints, active models, and API credentials used by the enrichment engine.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-burgundy" />
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-none border-l-4 border-red-500 bg-red-50/50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Provider and Model selection */}
            <div className="space-y-4 rounded-none border border-border bg-muted/10 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-burgundy">
                <Settings className="h-4 w-4" /> Active LLM Model & Endpoint
              </h3>
              
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="llm-provider" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    LLM Provider
                  </Label>
                  <select
                    id="llm-provider"
                    className="flex h-9 w-full rounded-none border border-input bg-background px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-gold disabled:cursor-not-allowed disabled:opacity-50"
                    value={defaults.llm_provider}
                    onChange={(e) => {
                      const provider = e.target.value as any;
                      setDefaults(prev => ({
                        ...prev,
                        llm_provider: provider,
                        llm_model: provider === 'deepseek' ? 'deepseek-chat' : (provider === 'gemini' ? 'gemini-2.5-flash' : 'google/gemma-4-e4b')
                      }));
                    }}
                  >
                    <option value="deepseek">DeepSeek (Production Default)</option>
                    <option value="openai_compatible">OpenAI Compatible (Custom API)</option>
                    <option value="lmstudio">LM Studio (Local Host)</option>
                    <option value="openai">OpenAI (Direct API)</option>
                    <option value="gemini">Google Gemini (Direct API)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scraping-ai-model" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Active AI Model
                  </Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <AIModelCombobox
                        id="scraping-ai-model"
                        value={defaults.llm_model}
                        options={fetchedModels}
                        onChange={(value) =>
                          setDefaults((prev) => ({
                            ...prev,
                            llm_model: value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 border-input bg-background"
                      onClick={() => {
                        const activeKey = getActiveApiKey(defaults.llm_provider);
                        void loadModelsList(defaults.llm_provider, defaults.llm_base_url, activeKey);
                      }}
                      disabled={fetchingModels}
                      title="Reload models list"
                    >
                      <RefreshCw className={`h-4 w-4 ${fetchingModels ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                  {fetchingModels && (
                    <div className="text-xs text-brand-gold font-medium animate-pulse">
                      Polling available models...
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scraping-confidence-threshold" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Confidence Threshold
                  </Label>
                  <Input
                    id="scraping-confidence-threshold"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    className="h-9 rounded-none focus-visible:ring-brand-gold"
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

              {(defaults.llm_provider === "openai_compatible" || defaults.llm_provider === "lmstudio") && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label htmlFor="llm-base-url" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" /> Custom Base URL
                  </Label>
                  <Input
                    id="llm-base-url"
                    type="text"
                    className="h-9 rounded-none focus-visible:ring-brand-gold"
                    value={defaults.llm_base_url || ""}
                    onChange={(e) => setDefaults(prev => ({ ...prev, llm_base_url: e.target.value || null }))}
                    placeholder={defaults.llm_provider === "lmstudio" ? "http://localhost:1234/v1" : "https://api.yourgateway.com/v1"}
                  />
                  <p className="text-xs text-muted-foreground">
                    The custom API URL hosting the models (e.g. <code>http://localhost:1234/v1</code> for local LM Studio).
                  </p>
                </div>
              )}
            </div>

            {/* API Credentials Grid */}
            <div className="space-y-4 rounded-none border border-border p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-burgundy">
                <Key className="h-4 w-4" /> API Credentials
              </h3>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="deepseek-api-key" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    DeepSeek API Key
                  </Label>
                  <Input
                    id="deepseek-api-key"
                    type="password"
                    value={deepseekApiKey}
                    onChange={(e) => setDeepseekApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="h-9 rounded-none focus-visible:ring-brand-gold"
                  />
                  <div className="text-xs text-muted-foreground">
                    {statuses.deepseek.configured
                      ? `Configured (ending in ${statuses.deepseek.last4 ?? "****"})`
                      : "Required for AI scraping and consolidation"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="openai-api-key" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    OpenAI API Key
                  </Label>
                  <Input
                    id="openai-api-key"
                    type="password"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    placeholder="sk-proj-..."
                    className="h-9 rounded-none focus-visible:ring-brand-gold"
                  />
                  <div className="text-xs text-muted-foreground">
                    {statuses.openai.configured
                      ? `Configured (ending in ${statuses.openai.last4 ?? "****"})`
                      : "Optional for OpenAI direct usage"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gemini-api-key" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Google Gemini API Key
                  </Label>
                  <Input
                    id="gemini-api-key"
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="AIza..."
                    className="h-9 rounded-none focus-visible:ring-brand-gold"
                  />
                  <div className="text-xs text-muted-foreground">
                    {statuses.gemini.configured
                      ? `Configured (ending in ${statuses.gemini.last4 ?? "****"})`
                      : "Optional for Gemini model usage"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lmstudio-api-key" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    LM Studio API Key / Token
                  </Label>
                  <Input
                    id="lmstudio-api-key"
                    type="password"
                    value={lmstudioApiKey}
                    onChange={(e) => setLmstudioApiKey(e.target.value)}
                    placeholder="Enter LM Studio token..."
                    className="h-9 rounded-none focus-visible:ring-brand-gold"
                  />
                  <div className="text-xs text-muted-foreground">
                    {statuses.lmstudio.configured
                      ? `Configured (ending in ${statuses.lmstudio.last4 ?? "****"})`
                      : "Optional for local developer token"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="openai-compatible-api-key" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    OpenAI Compatible API Key
                  </Label>
                  <Input
                    id="openai-compatible-api-key"
                    type="password"
                    value={openaiCompatibleApiKey}
                    onChange={(e) => setOpenaiCompatibleApiKey(e.target.value)}
                    placeholder="Enter Custom API Token..."
                    className="h-9 rounded-none focus-visible:ring-brand-gold"
                  />
                  <div className="text-xs text-muted-foreground">
                    {statuses.openai_compatible.configured
                      ? `Configured (ending in ${statuses.openai_compatible.last4 ?? "****"})`
                      : "Optional for custom gateway tokens"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serper-api-key" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Serper API Key
                  </Label>
                  <Input
                    id="serper-api-key"
                    type="password"
                    value={serperApiKey}
                    onChange={(e) => setSerperApiKey(e.target.value)}
                    placeholder="Paste Serper key..."
                    className="h-9 rounded-none focus-visible:ring-brand-gold"
                  />
                  <div className="text-xs text-muted-foreground">
                    {statuses.serpapi.configured
                      ? `Configured (ending in ${statuses.serpapi.last4 ?? "****"})`
                      : "Required for search-backed discovery"}
                  </div>
                </div>
              </div>
            </div>

            {/* Badges and action footer */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-border pt-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant={statuses.deepseek.configured ? "default" : "secondary"} className={statuses.deepseek.configured ? "bg-brand-burgundy text-white hover:bg-brand-burgundy" : ""}>
                  DeepSeek {statuses.deepseek.configured ? "Ready" : "Missing"}
                </Badge>
                <Badge variant={statuses.openai_compatible.configured ? "default" : "secondary"}>
                  Custom Gateway {statuses.openai_compatible.configured ? "Ready" : "Optional"}
                </Badge>
                <Badge variant={statuses.lmstudio.configured ? "default" : "secondary"}>
                  LM Studio {statuses.lmstudio.configured ? "Ready" : "Optional"}
                </Badge>
                <Badge variant={statuses.openai.configured ? "default" : "secondary"}>
                  OpenAI {statuses.openai.configured ? "Ready" : "Optional"}
                </Badge>
                <Badge variant={statuses.gemini.configured ? "default" : "secondary"}>
                  Gemini {statuses.gemini.configured ? "Ready" : "Optional"}
                </Badge>
                <Badge variant={statuses.serpapi.configured ? "default" : "secondary"}>
                  Serper {statuses.serpapi.configured ? "Ready" : "Missing"}
                </Badge>
              </div>

              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <Button
                  variant="outline"
                  onClick={fetchConfig}
                  disabled={loading || saving}
                  className="rounded-none border-input hover:bg-muted"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <Button 
                  onClick={onSave} 
                  disabled={saving || !hasChanges}
                  className="rounded-none bg-brand-burgundy text-white hover:bg-brand-burgundy/90 focus:ring-brand-gold"
                >
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
