'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Brand } from '@/lib/types';

interface BrandSourceSetupDomainStepProps {
  brand: Brand;
  hasOfficialDomain: boolean;
  canonicalDomain: string | null;
  siteExtractionProfile: { id: string | null; status: string | null } | null;
  onDomainSaved: () => Promise<void>;
  onNext: () => void;
}

/**
 * Step 1: Save/update the official brand domain.
 * Pre-fills from existing canonical domain, validates format,
 * calls PUT source-setup to persist, and shows saved confirmation.
 */
export function BrandSourceSetupDomainStep({
  brand,
  hasOfficialDomain,
  canonicalDomain,
  siteExtractionProfile,
  onDomainSaved,
  onNext,
}: BrandSourceSetupDomainStepProps) {
  const [domainInput, setDomainInput] = useState(canonicalDomain ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [editMode, setEditMode] = useState(!hasOfficialDomain);

  useEffect(() => {
    if (canonicalDomain) {
      const id = setTimeout(() => setDomainInput(canonicalDomain), 0);
      return () => clearTimeout(id);
    }
  }, [canonicalDomain]);

  const validateDomain = (domain: string): string | null => {
    const trimmed = domain.trim();
    if (!trimmed) return 'Domain is required';

    try {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(`https://${trimmed}`);
      const hostname = url.hostname;
      if (!hostname.includes('.') || hostname.length < 3) {
        return 'Invalid domain format';
      }
    } catch {
      return 'Invalid domain format';
    }
    return null;
  };

  const handleSave = async () => {
    const error = validateDomain(domainInput);
    if (error) {
      toast.error(error);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/admin/brands/${brand.id}/source-setup`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ official_domain: domainInput.trim() }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save domain');

      setEditMode(false);
      toast.success('Domain saved');
      await onDomainSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save domain',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <div className="text-sm text-muted-foreground">
        The official brand domain is the authoritative website for this
        brand&rsquo;s products. All PDP seeds must belong to this domain.
      </div>

      {/* Domain input / saved display */}
      {editMode ? (
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-foreground">
            Official Brand Domain
          </label>
          <div className="flex gap-2">
            <Input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="example.com"
              className="flex-1 font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave();
              }}
            />
            <Button
              onClick={() => void handleSave()}
              disabled={isSaving || !domainInput.trim()}
              className="rounded-none text-xs font-semibold"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 border border-brand-forest-green bg-brand-forest-green/5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-forest-green" />
            <div>
              <span className="text-sm font-semibold text-foreground">
                Domain saved
              </span>
              <p className="text-xs font-mono text-muted-foreground mt-1">
                {canonicalDomain || domainInput}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditMode(true)}
            className="text-xs font-semibold"
          >
            Edit
          </Button>
        </div>
      )}

      {/* Profile status summary */}
      {siteExtractionProfile?.id && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-4">
          <span>Site extraction profile:</span>
          <Badge
            variant="outline"
            className="text-[10px] rounded-none uppercase"
          >
            {siteExtractionProfile.status ?? 'draft'}
          </Badge>
        </div>
      )}
    </div>
  );
}
