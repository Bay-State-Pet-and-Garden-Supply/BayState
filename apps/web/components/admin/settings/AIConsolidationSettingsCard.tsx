'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Layers, Save, RefreshCw } from 'lucide-react';

interface ConsolidationDefaults {
  llm_model: 'gpt-4o-mini' | 'gpt-4o';
  confidence_threshold: number;
}

interface ApiResponse {
  consolidationDefaults: ConsolidationDefaults;
}

const DEFAULTS: ConsolidationDefaults = {
  llm_model: 'gpt-4o-mini',
  confidence_threshold: 0.7,
};

export function AIConsolidationSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      defaults.llm_model !== initialDefaults.llm_model ||
      defaults.confidence_threshold !== initialDefaults.confidence_threshold
    );
  }, [defaults, initialDefaults]);

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
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

      const body = (await res.json()) as { consolidationDefaults: ConsolidationDefaults };
      if (body.consolidationDefaults) {
        setDefaults(body.consolidationDefaults);
        setInitialDefaults(body.consolidationDefaults);
      }
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
              Configure the model and settings used for batch product consolidation.
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
                <Label htmlFor="consolidation-ai-model">Consolidation Model</Label>
                <select
                  id="consolidation-ai-model"
                  value={defaults.llm_model}
                  onChange={(e) =>
                    setDefaults((prev) => ({ ...prev, llm_model: e.target.value as ConsolidationDefaults['llm_model'] }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="consolidation-confidence-threshold">Confidence Threshold</Label>
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

            <div className="flex items-center justify-between border-t pt-4">
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
