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
import { Loader2, Bot, Save, RefreshCw } from "lucide-react";
import { AIModelCombobox } from "@/components/admin/settings/AIModelCombobox";
import { DEFAULT_AI_MODEL } from "@/lib/ai-scraping/models";

type ProviderName = "gemini" | "openai" | "serpapi";

interface ProviderStatus {
  provider: string;
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}

interface ScrapingDefaults {
  llm_provider: "openai";
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
  llm_provider: "openai",
  llm_model: DEFAULT_AI_MODEL,
  llm_base_url: null,
  max_search_results: 5,
  max_steps: 15,
  confidence_threshold: 0.7,
};

const EMPTY_STATUSES: Record<ProviderName, ProviderStatus> = {
  gemini: {
    provider: "gemini",
    configured: false,
    last4: null,
    updated_at: null,
  },
  openai: {
    provider: "openai",
    configured: false,
    last4: null,
    updated_at: null,
  },
  serpapi: {
    provider: "serpapi",
    configured: false,
    last4: null,
    updated_at: null,
  },
};

export function AIScrapingSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [serperApiKey, setSerperApiKey] = useState("");
  const [statuses, setStatuses] =
    useState<Record<ProviderName, ProviderStatus>>(EMPTY_STATUSES);
  const [defaults, setDefaults] = useState<ScrapingDefaults>(DEFAULTS);
  const [initialDefaults, setInitialDefaults] =
    useState<ScrapingDefaults>(DEFAULTS);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/ai-scraping/credentials");
      if (!res.ok) {
        throw new Error("Failed to load AI scraping settings");
      }

      const data = (await res.json()) as ApiResponse;
      setStatuses({
        gemini: data.statuses.gemini ?? EMPTY_STATUSES.gemini,
        openai: data.statuses.openai ?? EMPTY_STATUSES.openai,
        serpapi: data.statuses.serpapi ?? EMPTY_STATUSES.serpapi,
      });
      setDefaults({
        ...DEFAULTS,
        ...data.defaults,
        llm_provider: "openai",
        llm_base_url: null,
      });
      setInitialDefaults({
        ...DEFAULTS,
        ...data.defaults,
        llm_provider: "openai",
        llm_base_url: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
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
      openaiApiKey.trim().length > 0 ||
      serperApiKey.trim().length > 0 ||
      defaults.llm_model !== initialDefaults.llm_model ||
      defaults.max_search_results !== initialDefaults.max_search_results ||
      defaults.max_steps !== initialDefaults.max_steps ||
      defaults.confidence_threshold !== initialDefaults.confidence_threshold
    );
  }, [defaults, geminiApiKey, openaiApiKey, serperApiKey, initialDefaults]);

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        gemini_api_key: geminiApiKey.trim() || undefined,
        openai_api_key: openaiApiKey.trim() || undefined,
        serper_api_key: serperApiKey.trim() || undefined,
        defaults: {
          ...defaults,
          llm_provider: "openai" as const,
          llm_base_url: null,
        },
      };

      const res = await fetch("/api/admin/ai-scraping/credentials", {
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
        gemini: body.statuses.gemini ?? EMPTY_STATUSES.gemini,
        openai: body.statuses.openai ?? EMPTY_STATUSES.openai,
        serpapi: body.statuses.serpapi ?? EMPTY_STATUSES.serpapi,
      });
      setDefaults({
        ...DEFAULTS,
        ...body.defaults,
        llm_provider: "openai",
        llm_base_url: null,
      });
      setInitialDefaults({
        ...DEFAULTS,
        ...body.defaults,
        llm_provider: "openai",
        llm_base_url: null,
      });
      setGeminiApiKey("");
      setOpenaiApiKey("");
      setSerperApiKey("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-none bg-brand-gold border-2 border-zinc-950 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            <Bot className="h-5 w-5 text-brand-burgundy" />
          </div>
          <div>
            <CardTitle>AI Scraping Settings</CardTitle>
            <CardDescription>
              Configure the shared provider keys used across admin tooling:
              OpenAI powers AI Search, Crawl4AI enrichment, consolidation, and
              Finalization Copilot; Serper powers discovery; Gemini remains
              available for migration and testing workflows.
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
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="gemini-api-key">Gemini API Key (Optional)</Label>
                <Input
                  id="gemini-api-key"
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIza..."
                />
                <div className="text-xs text-muted-foreground">
                  {statuses.gemini.configured
                    ? `Configured (ending in ${statuses.gemini.last4 ?? "****"})`
                    : "Optional for Gemini migration and testing flows"}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="openai-api-key">OpenAI API Key</Label>
                <Input
                  id="openai-api-key"
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-..."
                />
                <div className="text-xs text-muted-foreground">
                  {statuses.openai.configured
                    ? `Configured (ending in ${statuses.openai.last4 ?? "****"})`
                    : "Required for AI scraping, consolidation, and Finalization Copilot"}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="serper-api-key">Serper API Key</Label>
                <Input
                  id="serper-api-key"
                  type="password"
                  value={serperApiKey}
                  onChange={(e) => setSerperApiKey(e.target.value)}
                  placeholder="Paste Serper key..."
                />
                <div className="text-xs text-muted-foreground">
                  {statuses.serpapi.configured
                    ? `Configured (ending in ${statuses.serpapi.last4 ?? "****"})`
                    : "Required for search-backed discovery"}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="scraping-ai-model">OpenAI Model</Label>
                <AIModelCombobox
                  id="scraping-ai-model"
                  value={defaults.llm_model}
                  onChange={(value) =>
                    setDefaults((prev) => ({
                      ...prev,
                      llm_model: value,
                    }))
                  }
                />
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
                    setDefaults((prev) => ({
                      ...prev,
                      max_search_results: Number(e.target.value) || 5,
                    }))
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
                    setDefaults((prev) => ({
                      ...prev,
                      max_steps: Number(e.target.value) || 15,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="scraping-confidence-threshold">
                  Confidence Threshold
                </Label>
                <Input
                  id="scraping-confidence-threshold"
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
              Legacy Gemini scraping settings are deprecated. Active scraper
              jobs, consolidation, and Finalization Copilot now use OpenAI,
              while Serper handles discovery. Keep a Gemini key only if you
              still need Gemini migration or testing workflows.
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex gap-2">
                <Badge
                  variant={statuses.gemini.configured ? "default" : "secondary"}
                >
                  Gemini {statuses.gemini.configured ? "Available" : "Optional"}
                </Badge>
                <Badge
                  variant={statuses.openai.configured ? "default" : "secondary"}
                >
                  OpenAI {statuses.openai.configured ? "Ready" : "Missing"}
                </Badge>
                <Badge
                  variant={statuses.serpapi.configured ? "default" : "secondary"}
                >
                  Serper {statuses.serpapi.configured ? "Ready" : "Missing"}
                </Badge>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={fetchConfig}
                  disabled={loading || saving}
                >
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
