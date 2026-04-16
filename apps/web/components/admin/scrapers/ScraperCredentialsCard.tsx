'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Shield, Save, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ScraperCredentialStatus, ScraperCredentialType } from '@/lib/admin/scrapers/credentials';
import { ConfirmationDialog } from '@/components/admin/confirmation-dialog';

interface ScraperCredentialsCardProps {
  slug: string;
}

export function ScraperCredentialsCard({ slug }: ScraperCredentialsCardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ScraperCredentialType | null>(null);
  const [deleting, setDeleting] = useState<ScraperCredentialType | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteType, setPendingDeleteType] = useState<ScraperCredentialType | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [statuses, setStatuses] = useState<ScraperCredentialStatus[]>([]);
  const [values, setValues] = useState<Record<ScraperCredentialType, string>>({
    login: '',
    password: '',
    api_key: ''
  });

  const fetchStatuses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/scrapers/${slug}/credentials`);
      if (!res.ok) {
        throw new Error('Failed to load scraper credentials');
      }

      const data = await res.json();
      setStatuses(data.statuses);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatuses();
  }, [slug]);

  const onSave = async (type: ScraperCredentialType) => {
    const value = values[type].trim();
    if (!value) {
      toast.error(`${type} cannot be empty`);
      return;
    }

    setSaving(type);
    setError(null);

    try {
      const res = await fetch(`/api/admin/scrapers/${slug}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, value }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.details || body?.error || 'Failed to save credential');
      }

      const body = await res.json();
      setStatuses(body.statuses);
      setValues(prev => ({ ...prev, [type]: '' }));
      toast.success(`${type} updated successfully`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(null);
    }
  };

  const onDeleteClick = (type: ScraperCredentialType) => {
    setPendingDeleteType(type);
    setConfirmOpen(true);
  };

  const onConfirmDelete = async () => {
    if (!pendingDeleteType) return;
    setConfirmOpen(false);

    const type = pendingDeleteType;
    setDeleting(type);
    setError(null);

    try {
      const res = await fetch(`/api/admin/scrapers/${slug}/credentials?type=${type}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.details || body?.error || 'Failed to delete credential');
      }

      const body = await res.json();
      setStatuses(body.statuses);
      toast.success(`${type} deleted successfully`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setDeleting(null);
    }

    setPendingDeleteType(null);
  };

  const getStatus = (type: ScraperCredentialType) => {
    return statuses.find(s => s.type === type);
  };

  return (
    <Card className="border-brand-gold/20 shadow-sm">
      <CardHeader className="bg-brand-gold/5 border-b">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-none bg-brand-gold border border-zinc-950 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            <Shield className="h-5 w-5 text-brand-burgundy" />
          </div>
          <div>
            <CardTitle>Scraper Credentials</CardTitle>
            <CardDescription>
              Manage login credentials and API keys used by the scraper runners.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 pt-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {error && <div className="rounded-none border border-brand-burgundy bg-brand-burgundy/5 p-3 text-sm text-brand-burgundy font-medium">{error}</div>}

            <div className="grid gap-8">
              {(['login', 'password', 'api_key'] as ScraperCredentialType[]).map((type) => {
                const status = getStatus(type);
                const isSaving = saving === type;
                const isDeleting = deleting === type;

                return (
                  <div key={type} className="space-y-3 p-4 rounded-none border border-zinc-950 bg-muted/5 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={type} className="text-sm font-bold uppercase tracking-tight flex items-center gap-2">
                        {type.replace('_', ' ')}
                        {status?.configured && (
                          <Badge variant="outline" className="bg-brand-forest-green/10 text-brand-forest-green border-brand-forest-green/20 text-[10px] h-5 px-1.5 rounded-none font-bold">
                            CONFIGURED
                          </Badge>
                        )}
                      </Label>
                      {status?.configured && (
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">
                          Last updated: {new Date(status.updated_at!).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Input
                        id={type}
                        type={type === 'password' ? 'password' : 'text'}
                        value={values[type]}
                        onChange={(e) => setValues(prev => ({ ...prev, [type]: e.target.value }))}
                        placeholder={status?.configured ? '•••••••• (Enter new to overwrite)' : `Enter ${type.replace('_', ' ')}...`}
                        className="flex-1 rounded-none border-zinc-300 focus:border-zinc-950 focus:ring-0"
                        disabled={isSaving || isDeleting}
                      />
                      <Button 
                        onClick={() => onSave(type)} 
                        disabled={isSaving || isDeleting || !values[type].trim()}
                        size="sm"
                        className="min-w-[80px] rounded-none bg-brand-forest-green hover:bg-brand-forest-green/90 text-white font-bold"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'SAVE'}
                      </Button>
                      {status?.configured && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => onDeleteClick(type)}
                          disabled={isSaving || isDeleting}
                          className="text-brand-burgundy hover:text-brand-burgundy/80 hover:bg-brand-burgundy/10 rounded-none px-2"
                        >
                          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3 w-3" />
                All credentials are encrypted with AES-256-GCM before storage.
              </div>

              <Button variant="outline" size="sm" onClick={fetchStatuses} disabled={loading || !!saving || !!deleting}>
                <RefreshCw className={`mr-2 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                Refresh Status
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingDeleteType(null);
        }}
        onConfirm={onConfirmDelete}
        title="Delete Credential"
        description={`Are you sure you want to delete the ${pendingDeleteType}?`}
        confirmLabel="Delete"
        variant="destructive"
        isLoading={!!deleting}
      />
    </Card>
  );
}
