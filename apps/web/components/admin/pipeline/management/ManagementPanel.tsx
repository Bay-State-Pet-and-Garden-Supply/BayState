'use client';

import { useEffect, useState } from 'react';
import { Package, Save, Loader2, CheckCircle2, AlertCircle, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { PipelineProduct } from '@/lib/pipeline/types';
import type { Brand } from '@/lib/types';

interface ManagementPanelProps {
  cohortId: string | null;
  products: PipelineProduct[];
  cohortBrandObjects?: Record<string, Brand>;
  onSuccess: () => void;
}

export function ManagementPanel({
  cohortId,
  products,
  cohortBrandObjects = {},
  onSuccess,
}: ManagementPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [cascadeConfigured, setCascadeConfigured] = useState<boolean | null>(null);
  const [checkingCascade, setCheckingCascade] = useState(false);

  useEffect(() => {
    if (products.length > 0) {
      let brand: Brand | null = null;
      if (cohortId && cohortBrandObjects[cohortId]) {
        brand = cohortBrandObjects[cohortId];
      } else {
        brand = products[0].cohort_brands || null;
      }
      setSelectedBrand(brand);
    } else {
      setSelectedBrand(null);
    }
  }, [cohortId, products.length, cohortBrandObjects]);

  // Check cascade readiness
  useEffect(() => {
    if (!selectedBrand?.id) {
      setCascadeConfigured(false);
      return;
    }

    const brandId = selectedBrand.id;
    let active = true;
    setCheckingCascade(true);
    async function check() {
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
    void check();
    return () => { active = false; };
  }, [selectedBrand?.id]);

    const handleStartExtraction = async () => {
    if (!cohortId) return;

    setIsSaving(true);
    try {
      const upcs = products.map((product) => product.upc);

      const response = await fetch('/api/admin/enrichment/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upcs,
          retryMode: 'all',
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
            ? `${skippedCount} product${skippedCount > 1 ? 's' : ''} skipped (missing brand/cascade)`
            : undefined,
      });
      onSuccess();
    } catch (error: any) {
      console.error('Error starting extraction:', error);
      toast.error(error.message || 'Failed to start extraction.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!cohortId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center border-t border-border bg-card p-6 text-center text-muted-foreground xl:border-l xl:border-t-0">
        <Package className="mb-2 h-12 w-12 opacity-20" />
        <h3 className="text-sm font-semibold text-foreground">No cohort selected</h3>
        <p className="mt-1 text-sm text-muted-foreground">Select a cohort to manage extraction.</p>
      </div>
    );
  }

  const brandName = selectedBrand?.name || 'Unknown Brand';
  const isBrandAssigned = Boolean(selectedBrand?.id);

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-t border-border bg-card xl:w-[320px] xl:border-l xl:border-t-0">
      <div className="border-b border-border bg-muted/30 p-4">
        <div className="mb-1 text-xs font-medium text-primary">Management</div>
        <h2 className="truncate text-sm font-semibold text-foreground">
          {cohortId === 'ungrouped' ? 'Ungrouped Products' : `Batch: ${cohortId}`}
        </h2>
        <div className="mt-1 text-sm text-muted-foreground">
          {products.length} Products included
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {/* Brand & Cascade Status */}
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
                    Assign a brand to this cohort before starting extraction.
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
            <div className="flex flex-col p-3 border border-dashed border-destructive/45 bg-destructive/[0.01]">
              <div className="flex items-center justify-between">
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
              <div className="mt-2 pt-2 border-t border-border/50 flex justify-end">
                <Link
                  href="/admin/brands"
                  className="text-[9px] font-bold text-brand-burgundy hover:underline flex items-center gap-1 transition-colors"
                >
                  <Settings2 className="h-3 w-3" />
                  Configure in Brand Settings
                </Link>
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

        <Button
          className="h-11 w-full bg-brand-gold text-ledger-charcoal hover:bg-brand-gold/90"
          disabled={isSaving || !cascadeConfigured}
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
