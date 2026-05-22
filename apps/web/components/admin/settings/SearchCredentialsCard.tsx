'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, RefreshCw, Save, CheckCircle } from 'lucide-react';
import { adminFetch } from '@/lib/admin/api-client';

interface CredentialStatus {
  provider: string;
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}

interface AICredentialsResponse {
  statuses: Record<string, CredentialStatus>;
}

export function SearchCredentialsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [last4, setLast4] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await adminFetch('/api/admin/ai-scraping/credentials');
      if (!res.ok) {
        throw new Error('Failed to load search credentials');
      }

      const data = (await res.json()) as AICredentialsResponse;
      const serpapi = data.statuses?.serpapi;
      if (serpapi) {
        setConfigured(serpapi.configured);
        setLast4(serpapi.last4);
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
    return apiKey.trim().length > 0;
  }, [apiKey]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await adminFetch('/api/admin/ai-scraping/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serper_api_key: apiKey.trim(),
        }),
      });

      const body = (await res.json()) as AICredentialsResponse & { error?: string; details?: string };
      if (!res.ok) {
        throw new Error(body.details || body.error || 'Failed to save search credentials');
      }

      setApiKey('');
      const serpapi = body.statuses?.serpapi;
      if (serpapi) {
        setConfigured(serpapi.configured);
        setLast4(serpapi.last4);
      }
      setSuccess('Search credentials updated successfully.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border border-border bg-card shadow-sm rounded-none">
      <CardHeader className="border-b border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-none bg-brand-forest-green border border-border">
            <Search className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold tracking-tight text-brand-forest-green">Search API Credentials</CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Configure search engine credentials for web extraction and approved-source lookups.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={onSave} className="space-y-6">
            {error && (
              <div className="rounded-none bg-destructive/10 border border-destructive/20 p-3.5 text-xs text-destructive font-medium animate-in fade-in duration-200">
                <p className="font-bold">Error</p>
                <p className="opacity-90">{error}</p>
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

            <div className="space-y-2">
              <Label htmlFor="serper-api-key" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Serper API Key
              </Label>
              <Input
                id="serper-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={configured && last4 ? `••••••••••••${last4} (Enter new key to change)` : 'Enter Serper API Key (from serper.dev)'}
                className="h-9 rounded-none border-input focus-visible:ring-brand-gold bg-background text-sm font-mono"
                autoComplete="new-password"
              />
              <p className="text-[10px] text-muted-foreground/80 leading-normal">
                Uses serper.dev API key to query search engines for approved domain and UPC enrichment matches.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <Badge variant={configured ? 'default' : 'secondary'} className="rounded-none">
                {configured ? 'Active' : 'Setup Required'}
              </Badge>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchConfig}
                  disabled={loading || saving}
                  className="rounded-none h-9 text-xs font-semibold border-border"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Refresh
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !hasChanges}
                  className="rounded-none h-9 text-xs font-semibold bg-brand-forest-green hover:bg-brand-forest-green/90 text-white gap-1.5"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      Save Key
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
