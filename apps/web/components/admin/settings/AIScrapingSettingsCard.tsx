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

type ProviderName = "openai" | "openai_compatible" | "serpapi" | "brave";
type LLMProvider = "openai" | "openai_compatible";

interface ProviderStatus {
  provider: ProviderName;
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}

interface ScrapingDefaults {
  llm_provider: LLMProvider;
  llm_model: string;
  llm_base_url: string | null;
  max_search_results: number;
  max_steps: number;
  confidence_threshold: number;
}

interface ApiResponse {
  statuses: Record<ProviderName, ProviderStatus>;
  defaults: ScrapingDefaults;
}

const DEFAULTS: ScrapingDefaults = {
  llm_provider: "openai",
  llm_model: "gpt-4o-mini",
  llm_base_url: null,
  max_search_results: 5,
  max_steps: 15,
  confidence_threshold: 0.7,
};

export function AIScrapingSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openAICompatibleApiKey, setOpenAICompatibleApiKey] = useState("");
  const [serpapiApiKey, setSerpapiApiKey] = useState("");
  const [braveApiKey, setBraveApiKey] = useState("");
  const [statuses, setStatuses] = useState<Record<ProviderName, ProviderStatus>>({
    openai: {
      provider: "openai",
      configured: false,
      last4: null,
      updated_at: null,
    },
    openai_compatible: {
      provider: "openai_compatible",
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
    brave: {
      provider: "brave",
      configured: false,
      last4: null,
      updated_at: null,
    },
  });
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
      setStatuses(data.statuses);
      setDefaults(data.defaults);
      setInitialDefaults(data.defaults);
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
      openaiApiKey.trim().length > 0 ||
      openAICompatibleApiKey.trim().length > 0 ||
      serpapiApiKey.trim().length > 0 ||
      braveApiKey.trim().length > 0 ||
      defaults.llm_provider !== initialDefaults.llm_provider ||
      defaults.llm_model !== initialDefaults.llm_model ||
      (defaults.llm_base_url || "") !== (initialDefaults.llm_base_url || "") ||
      defaults.max_search_results !== initialDefaults.max_search_results ||
      defaults.max_steps !== initialDefaults.max_steps ||
      defaults.confidence_threshold !== initialDefaults.confidence_threshold
    );
  }, [
    openaiApiKey,
    openAICompatibleApiKey,
    serpapiApiKey,
    braveApiKey,
    defaults,
    initialDefaults,
  ]);

  const onSave = async () => {
    setSaving(true);
    setError(null);

      try {
        const payload = {
          openai_api_key: openaiApiKey.trim() || undefined,
          openai_compatible_api_key: openAICompatibleApiKey.trim() || undefined,
          serpapi_api_key: serpapiApiKey.trim() || undefined,
          brave_api_key: braveApiKey.trim() || undefined,
          defaults,
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
      setStatuses(body.statuses);
      setDefaults(body.defaults);
      setInitialDefaults(body.defaults);
      setOpenaiApiKey("");
      setOpenAICompatibleApiKey("");
      setSerpapiApiKey("");
      setBraveApiKey("");
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
            <Bot className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <CardTitle>AI Scraping Settings</CardTitle>
            <CardDescription>
              Configure the LLM provider for Crawl4AI and AI search, plus the
              search provider keys used by runner-dispatched scraping jobs.
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

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                    ? `Configured (ending in ${statuses.openai.last4 ?? "****"})`
                    : "Not configured"}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="openai-compatible-api-key">
                  OpenAI-Compatible Endpoint Key
                </Label>
                <Input
                  id="openai-compatible-api-key"
                  type="password"
                  value={openAICompatibleApiKey}
                  onChange={(e) => setOpenAICompatibleApiKey(e.target.value)}
                  placeholder="Optional bearer token"
                />
                <div className="text-xs text-muted-foreground">
                  {statuses.openai_compatible.configured
                    ? `Configured (ending in ${statuses.openai_compatible.last4 ?? "****"})`
                    : "Optional for local/openai-compatible endpoints"}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="serpapi-api-key">SerpAPI Key</Label>
                <Input
                  id="serpapi-api-key"
                  type="password"
                  value={serpapiApiKey}
                  onChange={(e) => setSerpapiApiKey(e.target.value)}
                  placeholder="7aad..."
                />
                <div className="text-xs text-muted-foreground">
                  {statuses.serpapi.configured
                    ? `Configured (ending in ${statuses.serpapi.last4 ?? "****"})`
                    : "Not configured"}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="brave-api-key">
                  Brave Search API Key (Optional Fallback)
                </Label>
                <Input
                  id="brave-api-key"
                  type="password"
                  value={braveApiKey}
                  onChange={(e) => setBraveApiKey(e.target.value)}
                  placeholder="BSA..."
                />
                <div className="text-xs text-muted-foreground">
                  {statuses.brave.configured
                    ? `Configured (ending in ${statuses.brave.last4 ?? "****"})`
                    : "Not configured"}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="scraping-llm-provider">LLM Provider</Label>
                <select
                  id="scraping-llm-provider"
                  value={defaults.llm_provider}
                  onChange={(e) =>
                    setDefaults((prev) => ({
                      ...prev,
                      llm_provider: e.target.value as LLMProvider,
                      llm_base_url:
                        e.target.value === "openai_compatible"
                          ? prev.llm_base_url
                          : null,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="openai">OpenAI</option>
                  <option value="openai_compatible">
                    Self-hosted / OpenAI-compatible
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scraping-ai-model">Scraping Model</Label>
                <Input
                  id="scraping-ai-model"
                  value={defaults.llm_model}
                  onChange={(e) =>
                    setDefaults((prev) => ({
                      ...prev,
                      llm_model: e.target.value,
                    }))
                  }
                  placeholder={
                    defaults.llm_provider === "openai"
                      ? "gpt-4o-mini"
                      : "google/gemma-4-31B-it"
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scraping-llm-base-url">
                  LLM Base URL
                </Label>
                <Input
                  id="scraping-llm-base-url"
                  value={defaults.llm_base_url || ""}
                  onChange={(e) =>
                    setDefaults((prev) => ({
                      ...prev,
                      llm_base_url: e.target.value.trim() || null,
                    }))
                  }
                  placeholder="http://localhost:8000/v1"
                  disabled={defaults.llm_provider !== "openai_compatible"}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
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

            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex gap-2">
                <Badge
                  variant={statuses.openai.configured ? "default" : "secondary"}
                >
                  OpenAI {statuses.openai.configured ? "Ready" : "Missing"}
                </Badge>
                <Badge
                  variant={
                    defaults.llm_provider === "openai_compatible" &&
                    (!defaults.llm_base_url ||
                      !statuses.openai_compatible.configured)
                      ? "secondary"
                      : "default"
                  }
                >
                  Local LLM{" "}
                  {defaults.llm_provider === "openai_compatible"
                    ? defaults.llm_base_url
                      ? statuses.openai_compatible.configured
                        ? "Configured"
                        : "No Key"
                      : "Missing URL"
                    : "Optional"}
                </Badge>
                <Badge
                  variant={
                    statuses.serpapi.configured ? "default" : "secondary"
                  }
                >
                  SerpAPI {statuses.serpapi.configured ? "Ready" : "Missing"}
                </Badge>
                <Badge
                  variant={statuses.brave.configured ? "default" : "secondary"}
                >
                  Brave Fallback{" "}
                  {statuses.brave.configured ? "Ready" : "Optional"}
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
