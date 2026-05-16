'use client';

import { useState } from 'react';
import { Layers, Package, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PipelineProduct } from '@/lib/pipeline/types';
import type { Brand } from '@/lib/types';
import { BrandAssignmentSection } from './BrandAssignmentSection';
import { OfficialDomainsSection } from './OfficialDomainsSection';

interface ManagementPanelProps {
  selection: {
    skus: Set<string>;
    cohortId: string | null;
    products: PipelineProduct[];
  };
  onSuccess: () => void;
}

export function ManagementPanel({ selection, onSuccess }: ManagementPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [domains, setDomains] = useState<string[]>([]);

  if (selection.skus.size === 0 && !selection.cohortId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-card border-l border-border">
        <Package className="h-12 w-12 mb-2 opacity-20" />
        <h3 className="text-sm font-semibold text-foreground">Nothing selected</h3>
        <p className="text-[10px] font-semibold mt-1 uppercase tracking-widest">Select products or a cohort to manage assignments.</p>
      </div>
    );
  }

  return (
    <div className="w-[400px] border-l border-border bg-card flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="text-[10px] font-bold text-brand-gold uppercase tracking-widest mb-1">Management Panel</div>
        <h2 className="text-sm font-bold truncate">
          {selection.cohortId ? `Cohort: ${selection.cohortId}` : `${selection.skus.size} Products Selected`}
        </h2>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        <BrandAssignmentSection 
          selectedBrand={selectedBrand}
          onBrandChange={setSelectedBrand}
        />

        <OfficialDomainsSection 
          domains={domains}
          onDomainsChange={setDomains}
        />
      </div>

      {/* Footer Action */}
      <div className="p-4 border-t border-border bg-muted/30">
        <Button 
          className="w-full rounded-none bg-brand-gold hover:bg-brand-gold/90 text-brand-burgundy font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all h-12"
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          SAVE & START SCRAPER
        </Button>
      </div>
    </div>
  );
}
