'use client';

import { useEffect, useState } from 'react';
import { Package, Save, Loader2, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { PipelineProduct } from '@/lib/pipeline/types';
import type { Brand } from '@/lib/types';

interface ManagementPanelProps {
  groupName: string;
  products: PipelineProduct[];
  brand: Brand | null;
  onSuccess: () => void;
  readinessNonce?: number;
}

export function ManagementPanel({
  groupName,
  products,
  brand,
  onSuccess,
  readinessNonce = 0,
}: ManagementPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [cascadeConfigured, setCascadeConfigured] = useState<boolean | null>(
    brand?.id ? null : false
  );
  const [checkingCascade, setCheckingCascade] = useState(false);
  const [serpDiscoveryEnabled, setSerpDiscoveryEnabled] = useState(false);

  useEffect(() => {
    if (!brand?.id) {
      return;
    }

    const brandId = brand.id;
    let active = true;

    async function check() {
      if (active) {
        setCascadeConfigured(null);
        setCheckingCascade(true);
      }
      try {
        const res = await fetch(`/api/admin/brands/${brandId}/source-cascade`);
        if (!res.ok) throw new Error('Failed to check');
        const data = await res.json();
        if (active) {
          setCascadeConfigured(data.configured === true);
        }
      } catch {
        if (active) {
          setCascadeConfigured(false);
        }
      } finally {
        if (active) setCheckingCascade(false);
      }
    }

    const timeoutId = setTimeout(() => {
      void check();
    }, 0);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [brand?.id, readinessNonce]);

  const handleStartExtraction = async () => {
    const upcs = products.map((product) => product.upc);
    if (upcs.length === 0) return;

    const missingBrandUpcs = products
      .filter((product) => !product.brand_id)
      .map((product) => product.upc);

    if (missingBrandUpcs.length > 0) {
      toast.error('Assign a brand before extraction', {
        description: `${missingBrandUpcs.length} selected product${missingBrandUpcs.length === 1 ? '' : 's'} missing a brand.`,
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/enrichment/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upcs,
          retryMode: 'all',
          serpDiscoveryEnabled,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to start extraction');
      }

      const jobIds = Array.isArray(payload.jobIds) ? payload.jobIds : [];
      const skippedCount = Array.isArray(payload.skippedUpcs) ? payload.skippedUpcs.length : 0;

      toast.success(`Extraction started for ${upcs.length} products`, {
        description: jobIds.length > 0
          ? `Job ID${jobIds.length > 1 ? 's' : ''}: ${jobIds.map((id: string) => id.slice(0, 8)).join(', ')}`
          : skippedCount > 0
            ? `${skippedCount} product${skippedCount > 1 ? 's' : ''} skipped (missing cascade)`
            : undefined,
      });
      onSuccess();
    } catch (error) {
      console.error('Error starting extraction:', error);
      const errMsg = error instanceof Error ? error.message : 'Failed to start extraction.';
      toast.error(errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const brandName = brand?.name || 'No Brand';
  const isBrandAssigned = Boolean(brand?.id);

  if (products.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center border-t border-border bg-card p-6 text-center text-muted-foreground xl:border-l xl:border-t-0">
        <Package className="mb-2 h-12 w-12 opacity-20" />
        <h3 className="text-sm font-semibold text-foreground">No products selected</h3>
        <p className="mt-1 text-sm text-muted-foreground">Select a brand group to manage extraction.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-t border-border bg-card xl:w-[320px] xl:border-l xl:border-t-0">
      <div className="border-b border-border bg-muted/30 p-4">
        <div className="mb-1 text-xs font-medium text-primary">Management</div>
        <h2 className="truncate text-sm font-semibold text-foreground">
          {groupName}
        </h2>
        <div className="mt-1 text-sm text-muted-foreground">
          {products.length} Products included
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-muted-foreground" />
            Source Cascade
          </label>

          {!isBrandAssigned ? (
            <div className="flex flex-col p-3 border border-dashed border-muted-foreground/30 bg-muted/20 text-muted-foreground">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">No Brand Assigned</span>
                  <span className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                    Assign a brand before starting extraction.
                  </span>
                </div>
              </div>
            </div>
          ) : checkingCascade ? (
            <div className="flex items-center gap-3 p-3 border border-border bg-card">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground">{brandName}</span>
                <span className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                  Checking cascade configuration...
                </span>
              </div>
            </div>
          ) : cascadeConfigured ? (
            <div className="flex items-center justify-between p-3 border border-brand-forest-green bg-brand-forest-green/5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-brand-forest-green shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">{brandName}</span>
                  <span className="text-[9px] text-brand-forest-green font-semibold mt-0.5">
                    Cascade configured — ready to extract
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 border border-dashed border-destructive/45 bg-destructive/[0.01]">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">{brandName}</span>
                  <span className="text-[9px] text-destructive font-semibold mt-0.5">
                    Source Cascade not configured
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-muted/30 p-4 space-y-3">
        <div className="text-[10px] text-muted-foreground font-semibold">
          {isBrandAssigned
            ? `Brand: ${brandName} — ${cascadeConfigured ? 'Cascade ready' : 'Cascade not configured'}`
            : 'Assign a brand to enable extraction'}
        </div>

        {/* SERP Discovery toggle */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-foreground truncate">SERP Discovery</span>
              <span className="text-[10px] text-muted-foreground truncate">
                {serpDiscoveryEnabled
                  ? 'AI-powered search fallback enabled'
                  : 'Distributor-only extraction'}
              </span>
            </div>
          </div>
          <Switch
            checked={serpDiscoveryEnabled}
            onCheckedChange={setSerpDiscoveryEnabled}
            disabled={isSaving}
          />
        </div>

        <Button
          className="h-11 w-full bg-brand-gold text-ledger-charcoal hover:bg-brand-gold/90"
          disabled={isSaving || !cascadeConfigured || !isBrandAssigned}
          onClick={handleStartExtraction}
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Start Extraction
        </Button>
      </div>
    </div>
  );
}
