'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, Loader2, RefreshCw, Save } from 'lucide-react';

interface ShopSiteSettingsResponse {
  storeUrl: string;
  merchantId: string;
  passwordConfigured: boolean;
}

export function ShopSiteCredentialsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeUrl, setStoreUrl] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [initialState, setInitialState] = useState({ storeUrl: '', merchantId: '' });

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/settings/shopsite');
      if (!res.ok) {
        throw new Error('Failed to load ShopSite settings');
      }

      const data = (await res.json()) as ShopSiteSettingsResponse;
      setStoreUrl(data.storeUrl);
      setMerchantId(data.merchantId);
      setPasswordConfigured(data.passwordConfigured);
      setInitialState({ storeUrl: data.storeUrl, merchantId: data.merchantId });
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
      storeUrl !== initialState.storeUrl ||
      merchantId !== initialState.merchantId ||
      password.trim().length > 0
    );
  }, [storeUrl, merchantId, password, initialState]);

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/settings/shopsite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeUrl,
          merchantId,
          password: password.trim() || undefined,
        }),
      });

      const body = (await res.json()) as ShopSiteSettingsResponse & { error?: string; details?: string };
      if (!res.ok) {
        throw new Error(body.details || body.error || 'Failed to save ShopSite settings');
      }

      setPassword('');
      setPasswordConfigured(body.passwordConfigured);
      setInitialState({ storeUrl: body.storeUrl, merchantId: body.merchantId });
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
          <div className="flex h-10 w-10 items-center justify-center rounded-none bg-brand-forest-green border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <Database className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle>ShopSite Credentials</CardTitle>
            <CardDescription>
              Store ShopSite connection details here for GitHub-run sync jobs.
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
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="shopsite-store-url">ShopSite Store URL</Label>
                <Input
                  id="shopsite-store-url"
                  type="url"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  placeholder="https://yourstore.example.com/cgi-bin/bo/db_xml.cgi"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shopsite-merchant-id">Merchant ID</Label>
                <Input
                  id="shopsite-merchant-id"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  placeholder="ShopSite merchant ID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shopsite-password">API Password</Label>
                <Input
                  id="shopsite-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={passwordConfigured ? 'Leave blank to keep existing password' : 'ShopSite API password'}
                />
                <div className="text-xs text-muted-foreground">
                  {passwordConfigured ? 'Password is configured' : 'Password not configured'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <Badge variant={passwordConfigured ? 'default' : 'secondary'}>
                {passwordConfigured ? 'Connection Ready' : 'Setup Required'}
              </Badge>

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
                      Save ShopSite Settings
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
