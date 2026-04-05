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
import { GeminiModelCombobox } from "@/components/admin/settings/GeminiModelCombobox";

type ProviderName = "gemini";

interface ProviderStatus {
  provider: string;
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}

interface ScrapingDefaults {
  llm_provider: "gemini";
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
  llm_provider: "gemini",
  llm_model: "gemini-2.5-flash",
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
};

export function AIScrapingSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");
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
      });
      setDefaults({
        ...DEFAULTS,
        ...data.defaults,
        llm_provider: "gemini",
        llm_base_url: null,
      });
      setInitialDefaults({
        ...DEFAULTS,
        ...data.defaults,
        llm_provider: "gemini",
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
      defaults.llm_model !== initialDefaults.llm_model ||
      defaults.max_search_results !== initialDefaults.max_search_results ||
      defaults.max_steps !== initialDefaults.max_steps ||
      defaults.confidence_threshold !== initialDefaults.confidence_threshold
    );
  }, [defaults, geminiApiKey, initialDefaults]);

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        gemini_api_key: geminiApiKey.trim() || undefined,
        defaults: {
          ...defaults,
          llm_provider: "gemini" as const,
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
      });
      setDefaults({
        ...DEFAULTS,
        ...body.defaults,
        llm_provider: "gemini",
        llm_base_url: null,
      });
      setInitialDefaults({
        ...DEFAULTS,
        ...body.defaults,
        llm_provider: "gemini",
        llm_base_url: null,
      });
      setGeminiApiKey("");
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
              AI scraping now runs on Gemini directly. Configure the Gemini API
              key used for Crawl4AI and AI search. Legacy SerpAPI and Brave
              Search discovery keys are deprecated and no longer configured
              here.
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

            <div className="max-w-md space-y-2">
              <Label htmlFor="gemini-api-key">Gemini API Key</Label>
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
                  : "Required for AI scraping"}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="scraping-ai-model">Gemini Model</Label>
                <GeminiModelCombobox
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

            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex gap-2">
                <Badge
                  variant={statuses.gemini.configured ? "default" : "secondary"}
                >
                  Gemini {statuses.gemini.configured ? "Ready" : "Missing"}
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
