"use client";

import { CohortBrandPicker, type CohortBrandOption } from "./CohortBrandPicker";

interface CohortBrandBadgeProps {
  brand: CohortBrandOption | null;
  onAssign: (brand: CohortBrandOption | null) => Promise<void>;
  className?: string;
}

export function CohortBrandBadge({
  brand,
  onAssign,
  className = "",
}: CohortBrandBadgeProps) {
  return (
    <CohortBrandPicker
      value={brand}
      onAssign={onAssign}
      className={className}
      triggerClassName="h-8 px-2.5"
      emptyLabel="Assign Brand"
    />
  );
}
