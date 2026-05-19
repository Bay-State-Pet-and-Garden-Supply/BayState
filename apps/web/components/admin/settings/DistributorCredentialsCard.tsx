'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Trash2, ShieldCheck, ShieldOff, Store } from 'lucide-react';
import { adminFetch } from '@/lib/admin/api-client';

interface CredentialStatus {
  type: string;
  configured: boolean;
  updated_at?: string | null;
}

interface CredentialStatusesResponse {
  statuses: CredentialStatus[];
}

interface DistributorInfo {
  slug: string;
  name: string;
  requiresAuth: boolean;
  description: string;
}

const DISTRIBUTORS: DistributorInfo[] = [
  { slug: 'phillips', name: 'Phillips Pet', requiresAuth: true, description: 'shop.phillipspet.com' },
  { slug: 'orgill', name: 'Orgill', requiresAuth: true, description: 'www.orgill.com' },
  { slug: 'petfoodex', name: 'Pet Food Experts', requiresAuth: true, description: 'orders.petfoodexperts.com' },
  { slug: 'bradley', name: 'Bradley Caldwell', requiresAuth: false, description: 'www.bradleycaldwell.com' },
  { slug: 'central-pet', name: 'Central Pet', requiresAuth: false, description: 'www.centralpet.com' },
];

interface DistributorState {
  username: string;
  password: string;
  loginConfigured: boolean;
  passwordConfigured: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

function DistributorCredentialRow({ distributor }: { distributor: DistributorInfo }) {
  const [state, setState] = useState<DistributorState>({
    username: '',
    password: '',
    loginConfigured: false,
    passwordConfigured: false,
    loading: true,
    saving: false,
    error: null,
  });
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await adminFetch(`/api/admin/pipeline/scrapers/${distributor.slug}/credentials`);
      if (!mountedRef.current) return;
      if (!res.ok) throw new Error('Failed to fetch credential status');
      const data = (await res.json()) as CredentialStatusesResponse;
      if (!mountedRef.current) return;
      const login = data.statuses.find(s => s.type === 'login');
      const password = data.statuses.find(s => s.type === 'password');
      setState(prev => ({
        ...prev,
        loginConfigured: login?.configured ?? false,
        passwordConfigured: password?.configured ?? false,
        loading: false,
      }));
    } catch (e) {
      if (!mountedRef.current) return;
      setState(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Unknown error', loading: false }));
    }
  }, [distributor.slug]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchStatus();
    return () => { mountedRef.current = false; };
  }, [fetchStatus]);

  const onSave = async () => {
    setState(prev => ({ ...prev, saving: true, error: null }));
    try {
      if (state.username.trim()) {
        const loginRes = await adminFetch(`/api/admin/pipeline/scrapers/${distributor.slug}/credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'login', value: state.username.trim() }),
        });
        if (!loginRes.ok) {
          const err = await loginRes.json();
          throw new Error(err.details || err.error || 'Failed to save login');
        }
      }
      if (state.password.trim()) {
        const passRes = await adminFetch(`/api/admin/pipeline/scrapers/${distributor.slug}/credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'password', value: state.password.trim() }),
        });
        if (!passRes.ok) {
          const err = await passRes.json();
          throw new Error(err.details || err.error || 'Failed to save password');
        }
      }
      setState(prev => ({ ...prev, username: '', password: '', saving: false }));
      await fetchStatus();
    } catch (e) {
      setState(prev => ({ ...prev, saving: false, error: e instanceof Error ? e.message : 'Unknown error' }));
    }
  };

  const onClear = async () => {
    setState(prev => ({ ...prev, saving: true, error: null }));
    try {
      if (state.loginConfigured) {
        const delRes = await adminFetch(`/api/admin/pipeline/scrapers/${distributor.slug}/credentials?type=login`, { method: 'DELETE' });
        if (!delRes.ok) {
          const err = await delRes.json();
          throw new Error(err.details || err.error || 'Failed to clear login');
        }
      }
      if (state.passwordConfigured) {
        const delRes = await adminFetch(`/api/admin/pipeline/scrapers/${distributor.slug}/credentials?type=password`, { method: 'DELETE' });
        if (!delRes.ok) {
          const err = await delRes.json();
          throw new Error(err.details || err.error || 'Failed to clear password');
        }
      }
      setState(prev => ({ ...prev, saving: false }));
      await fetchStatus();
    } catch (e) {
      setState(prev => ({ ...prev, saving: false, error: e instanceof Error ? e.message : 'Unknown error' }));
    }
  };

  const anyConfigured = state.loginConfigured || state.passwordConfigured;
  const hasChanges = state.username.trim().length > 0 || state.password.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.saving && hasChanges) void onSave();
  };

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-8 border rounded-lg bg-muted/10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="font-medium">{distributor.name}</span>
              <span className="text-xs text-muted-foreground ml-2">{distributor.description}</span>
            </div>
          </div>
          <Badge variant={anyConfigured ? 'default' : 'secondary'} className="gap-1">
            {anyConfigured ? (
              <><ShieldCheck className="h-3 w-3" /> Configured</>
            ) : (
              <><ShieldOff className="h-3 w-3" /> Not configured</>
            )}
          </Badge>
        </div>

        {state.error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
        <Label htmlFor={`${distributor.slug}-username`}>Username</Label>
        <Input
        id={`${distributor.slug}-username`}
        value={state.username}
        onChange={(e) => setState(prev => ({ ...prev, username: e.target.value }))}
        placeholder={state.loginConfigured ? 'Leave blank to keep existing' : 'Enter username'}
        autoComplete="new-password"
        />
        </div>
        <div className="space-y-1.5">
        <Label htmlFor={`${distributor.slug}-password`}>Password</Label>
        <Input
        id={`${distributor.slug}-password`}
        type="password"
        value={state.password}
        onChange={(e) => setState(prev => ({ ...prev, password: e.target.value }))}
        placeholder={state.passwordConfigured ? 'Leave blank to keep existing' : 'Enter password'}
        autoComplete="new-password"
        />
        </div>
        </div>
        <div className="flex justify-end gap-2">
          {anyConfigured && (
            <Button type="button" variant="outline" size="sm" onClick={onClear} disabled={state.saving}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
          <Button type="submit" size="sm" disabled={state.saving || !hasChanges}>
            {state.saving ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...</>
            ) : (
              <><Save className="mr-1.5 h-3.5 w-3.5" /> Save</>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

function NoAuthBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">No auth required</Badge>
  );
}

export function DistributorCredentialsCard() {
  const authRequired = DISTRIBUTORS.filter(d => d.requiresAuth);
  const noAuth = DISTRIBUTORS.filter(d => !d.requiresAuth);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-none bg-brand-forest-green border border-border">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle>Distributor Credentials</CardTitle>
            <CardDescription>
              Manage login credentials for approved-source distributor portals.
              Used by the runner for authenticated product extraction.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Authentication Required</h4>
          {authRequired.map(d => (
            <DistributorCredentialRow key={d.slug} distributor={d} />
          ))}
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">No Authentication Required</h4>
          {noAuth.map(d => (
            <div key={d.slug} className="flex items-center justify-between border rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{d.description}</span>
                </div>
              </div>
              <NoAuthBadge />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
