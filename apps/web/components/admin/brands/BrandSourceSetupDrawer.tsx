'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { BrandSourceSetupStepIndicator } from './BrandSourceSetupStepIndicator';
import { BrandSourceSetupDomainStep } from './BrandSourceSetupDomainStep';
import { BrandSourceSetupPdpSeedStep } from './BrandSourceSetupPdpSeedStep';
import { BrandSourceSetupProfileStatusStep } from './BrandSourceSetupProfileStatusStep';
import type { Brand } from '@/lib/types';
import type { BrandSourceSetupResponse } from '@/lib/profile-maintenance/brand-source-setup-types';

const STEPS = ['Domain', 'PDP Seeds', 'Profile Status'];

interface BrandSourceSetupDrawerProps {
  brand: Brand;
  brandGroupId: string;
  onSetupComplete?: () => void;
  open: boolean;
  onClose: () => void;
}

/**
 * Main Sheet drawer orchestrator for brand source setup.
 * Manages 3-step wizard: Domain → PDP Seeds → Profile Status.
 * Embeds cascade editor in step 3.
 */
export function BrandSourceSetupDrawer({
  brand,
  brandGroupId: _brandGroupId,
  onSetupComplete,
  open,
  onClose,
}: BrandSourceSetupDrawerProps) {
  const [sourceSetup, setSourceSetup] =
    useState<BrandSourceSetupResponse | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch source-setup data when drawer opens
  const fetchSourceSetup = useCallback(async () => {
    if (!open) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/brands/${brand.id}/source-setup`,
      );
      if (res.ok) {
        const data = (await res.json()) as BrandSourceSetupResponse;
        setSourceSetup(data);
      }
    } catch (err) {
      console.error(
        '[BrandSourceSetupDrawer] Failed to load source setup:',
        err,
      );
    } finally {
      setIsLoading(false);
    }
  }, [brand.id, open]);

  useEffect(() => {
    const id = setTimeout(() => { void fetchSourceSetup(); }, 0);
    return () => clearTimeout(id);
  }, [fetchSourceSetup]);

  // Reset step to 0 when opening the drawer for a new brand.
  // Uses setTimeout(0) to defer the state update and satisfy the
  // react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => setCurrentStep(0), 0);
      return () => clearTimeout(id);
    }
  }, [open, brand.id]);

  const handleRefresh = useCallback(async () => {
    await fetchSourceSetup();
  }, [fetchSourceSetup]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDone = useCallback(() => {
    if (onSetupComplete) onSetupComplete();
    onClose();
  }, [onSetupComplete, onClose]);

  // Derived step completion states
  const completed = [
    !!sourceSetup?.sourceSetup.hasOfficialDomain,
    (sourceSetup?.sourceSetup.pdpSeeds ?? []).length > 0,
    true, // Profile status is always viewable
  ];

  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 0));
  const handleNext = () => setCurrentStep((s) => Math.min(s + 1, 2));

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full max-w-[640px] flex-col p-0 sm:max-w-[640px]"
      >
        <SheetHeader className="border-b border-border bg-card px-6 py-5 text-left">
          <SheetTitle>Brand Setup: {brand.name}</SheetTitle>
          <SheetDescription>
            Configure brand sources, add product seeds, and review profile
            status.
          </SheetDescription>
        </SheetHeader>

        {/* Step indicator */}
        <BrandSourceSetupStepIndicator
          steps={STEPS}
          currentStep={currentStep}
          completed={completed}
        />

        {/* Step content area */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading source setup...
              </p>
            </div>
          ) : sourceSetup ? (
            <>
              {currentStep === 0 && (
                <BrandSourceSetupDomainStep
                  brand={brand}
                  hasOfficialDomain={
                    sourceSetup.sourceSetup.hasOfficialDomain
                  }
                  canonicalDomain={
                    sourceSetup.sourceSetup.siteExtractionProfile
                      ?.canonical_domain ?? null
                  }
                  siteExtractionProfile={
                    sourceSetup.sourceSetup.siteExtractionProfile
                  }
                  onDomainSaved={handleRefresh}
                  onNext={handleNext}
                />
              )}
              {currentStep === 1 && (
                <BrandSourceSetupPdpSeedStep
                  brandId={brand.id}
                  brandSlug={brand.slug}
                  canonicalDomain={
                    sourceSetup.sourceSetup.siteExtractionProfile
                      ?.canonical_domain ?? ''
                  }
                  pdpSeeds={sourceSetup.sourceSetup.pdpSeeds}
                  onSeedsChanged={handleRefresh}
                  onNext={handleNext}
                />
              )}
              {currentStep === 2 && (
                <BrandSourceSetupProfileStatusStep
                  brand={brand}
                  sourceSetup={sourceSetup.sourceSetup}
                  onRefresh={handleRefresh}
                />
              )}
            </>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
              <p className="text-sm">
                Failed to load source setup data.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchSourceSetup()}
                className="rounded-none text-xs font-semibold"
              >
                Retry
              </Button>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="rounded-none text-xs font-semibold"
          >
            Back
          </Button>
          <Button
            onClick={currentStep < 2 ? handleNext : handleDone}
            className="rounded-none text-xs font-semibold"
          >
            {currentStep < 2 ? 'Next' : 'Done'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
