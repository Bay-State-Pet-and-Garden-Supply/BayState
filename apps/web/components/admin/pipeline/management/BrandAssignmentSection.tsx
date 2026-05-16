'use client';

import { CohortBrandPicker } from '../../cohorts/CohortBrandPicker';
import type { Brand } from '@/lib/types';

interface BrandAssignmentSectionProps {
  selectedBrand: Brand | null;
  onBrandChange: (brand: Brand | null) => void;
}

export function BrandAssignmentSection({ selectedBrand, onBrandChange }: BrandAssignmentSectionProps) {
  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-muted-foreground" />
        1. Assign Brand
      </label>
      <CohortBrandPicker
        value={selectedBrand}
        onAssign={async (brand) => onBrandChange(brand)}
        triggerClassName="w-full h-11 border-2"
        emptyLabel="Search Brands..."
      />
    </div>
  );
}
