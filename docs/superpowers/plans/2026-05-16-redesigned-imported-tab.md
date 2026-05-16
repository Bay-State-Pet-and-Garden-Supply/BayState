# Redesigned Imported Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the 'Imported' tab UI into a Master-Detail layout for streamlined assignment of Brands, Distributors, and Official Domains.

**Architecture:** 
- **Master View (Left):** Refactored `ImportedResultsView.tsx` with a selection-driven Master list.
- **Detail View (Right):** New `ManagementPanel.tsx` and sub-components (`BrandAssignmentSection`, `DistributorSection`, `OfficialDomainsSection`) for real-time management.
- **Data Flow:** Uses a selection state to track selected products/cohorts and applies batch updates via a new server action file.

**Tech Stack:** React (Next.js), Tailwind CSS, Lucide Icons, Radix UI, Supabase.

---

### Task 1: Create Batch Update Actions

**Files:**
- Create: `apps/web/app/admin/pipeline/batch-actions.ts`

- [ ] **Step 1: Implement `updateProductsBatch` action**

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateProductsBatch(
  skus: string[],
  updates: {
    brand_id?: string | null;
    official_domains?: string[];
    // Add other fields as needed
  }
) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('products_ingestion')
    .update(updates)
    .in('sku', skus);

  if (error) throw error;
  
  revalidatePath('/admin/pipeline');
  return { success: true };
}
```

- [ ] **Step 2: Implement `updateCohortBatch` action**

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateCohortBatch(
  cohortId: string,
  updates: {
    brand_id?: string | null;
    brand_name?: string | null;
    name?: string | null;
  }
) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('cohort_batches')
    .update(updates)
    .eq('id', cohortId);

  if (error) throw error;
  
  revalidatePath('/admin/pipeline');
  return { success: true };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/admin/pipeline/batch-actions.ts
git commit -m "feat(pipeline): add batch update actions for products and cohorts"
```

---

### Task 2: Create Management Panel Skeleton

**Files:**
- Create: `apps/web/components/admin/pipeline/management/ManagementPanel.tsx`

- [ ] **Step 1: Define `ManagementPanel` component**

```tsx
'use client';

import { useState } from 'react';
import { Layers, Package, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PipelineProduct } from '@/lib/pipeline/types';
import type { Brand } from '@/lib/types';

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
        {/* Sections will go here */}
        <div className="text-xs text-muted-foreground italic">Assignment sections coming soon...</div>
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/admin/pipeline/management/ManagementPanel.tsx
git commit -m "feat(pipeline): add ManagementPanel skeleton"
```

---

### Task 3: Implement Brand Assignment Section

**Files:**
- Create: `apps/web/components/admin/pipeline/management/BrandAssignmentSection.tsx`

- [ ] **Step 1: Implement `BrandAssignmentSection` using `CohortBrandPicker`**

```tsx
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
```

- [ ] **Step 2: Integrate into `ManagementPanel.tsx`**

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/admin/pipeline/management/BrandAssignmentSection.tsx
git commit -m "feat(pipeline): add BrandAssignmentSection to ManagementPanel"
```

---

### Task 4: Implement Official Domains Section

**Files:**
- Create: `apps/web/components/admin/pipeline/management/OfficialDomainsSection.tsx`

- [ ] **Step 1: Implement `OfficialDomainsSection` with multi-tag input**

```tsx
'use client';

import { X, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface OfficialDomainsSectionProps {
  domains: string[];
  onDomainsChange: (domains: string[]) => void;
}

export function OfficialDomainsSection({ domains, onDomainsChange }: OfficialDomainsSectionProps) {
  const addDomain = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value) {
      const newDomain = e.currentTarget.value.trim().toLowerCase();
      if (!domains.includes(newDomain)) {
        onDomainsChange([...domains, newDomain]);
      }
      e.currentTarget.value = '';
    }
  };

  const removeDomain = (domain: string) => {
    onDomainsChange(domains.filter(d => d !== domain));
  };

  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-brand-gold" />
        2. Official Domains (Required)
      </label>
      
      <div className={cn(
        "p-3 border-2 min-h-[100px] flex flex-col gap-3",
        domains.length === 0 ? "border-brand-burgundy/50 bg-brand-burgundy/5" : "border-border bg-card"
      )}>
        <div className="flex flex-wrap gap-2">
          {domains.map(domain => (
            <span key={domain} className="inline-flex items-center gap-1 px-2 py-1 bg-muted border border-border text-[11px] font-bold">
              {domain}
              <X className="h-3 w-3 cursor-pointer hover:text-brand-burgundy" onClick={() => removeDomain(domain)} />
            </span>
          ))}
          {domains.length === 0 && (
            <div className="flex items-center gap-1.5 text-brand-burgundy text-[10px] font-bold uppercase italic">
              <AlertCircle className="h-3 w-3" />
              Missing domains - SERP fallback disabled
            </div>
          )}
        </div>
        <Input 
          placeholder="Type domain and press Enter..." 
          onKeyDown={addDomain}
          className="h-8 rounded-none border-border bg-background text-xs"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into `ManagementPanel.tsx`**

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/admin/pipeline/management/OfficialDomainsSection.tsx
git commit -m "feat(pipeline): add OfficialDomainsSection to ManagementPanel"
```

---

### Task 5: Implement Distributor Section (The New Setup)

**Files:**
- Create: `apps/web/components/admin/pipeline/management/DistributorSection.tsx`

- [ ] **Step 1: Implement `DistributorSection` using adapter registry concepts**

```tsx
'use client';

import { CheckCircle2, Circle } from 'lucide-react';

const APPROVED_DISTRIBUTORS = [
  { id: 'bradley_crawl4ai', label: 'Bradley Caldwell' },
  { id: 'phillips_crawl4ai', label: 'Phillips Pet' },
  { id: 'pet_food_experts_crawl4ai', label: 'Pet Food Experts' },
  { id: 'central_pet_crawl4ai', label: 'Central Pet' },
  { id: 'orgill_crawl4ai', label: 'Orgill' },
];

interface DistributorSectionProps {
  activeScrapers: string[];
  onToggleScraper: (id: string) => void;
}

export function DistributorSection({ activeScrapers, onToggleScraper }: DistributorSectionProps) {
  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-muted-foreground" />
        3. Distributor Sources (Adapter Sync)
      </label>
      
      <div className="grid grid-cols-1 gap-1.5">
        {APPROVED_DISTRIBUTORS.map(dist => {
          const isActive = activeScrapers.includes(dist.id);
          return (
            <button
              key={dist.id}
              onClick={() => onToggleScraper(dist.id)}
              className={cn(
                "flex items-center justify-between p-3 border text-left transition-all",
                isActive 
                  ? "border-brand-forest-green bg-brand-forest-green/5 text-foreground" 
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full", isActive ? "bg-brand-forest-green shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-muted")} />
                <span className="text-xs font-bold">{dist.label}</span>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest">
                {isActive ? "Enabled" : "Disabled"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into `ManagementPanel.tsx`**

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/admin/pipeline/management/DistributorSection.tsx
git commit -m "feat(pipeline): add DistributorSection to ManagementPanel"
```

---

### Task 6: Refactor ImportedResultsView Layout

**Files:**
- Modify: `apps/web/components/admin/pipeline/ImportedResultsView.tsx`

- [ ] **Step 1: Update layout to Master-Detail**

```tsx
// Replace current right column (Cohort Summary) with:
<div className="flex-1 flex flex-row overflow-hidden">
  {/* Center: Product List/Preview (Master) */}
  <div className="flex-1 overflow-y-auto p-4 bg-background">
     {/* Existing product grid logic here */}
  </div>

  {/* Right: Management Panel (Detail) */}
  <ManagementPanel 
    selection={{
      skus: selectedSkus,
      cohortId: activeCohortId,
      products: cohortProducts,
    }}
    onSuccess={onRefresh}
  />
</div>
```

- [ ] **Step 2: Ensure "Import Integra" and "Add Product" buttons are preserved**

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/admin/pipeline/ImportedResultsView.tsx
git commit -m "refactor(pipeline): implement master-detail layout in ImportedResultsView"
```

---

### Task 7: Final Integration and Batch Logic

**Files:**
- Modify: `apps/web/components/admin/pipeline/management/ManagementPanel.tsx`

- [ ] **Step 1: Implement `handleSave` with batch actions**
- [ ] **Step 2: Add validation for Brand/Domains before allowing "Start Scraper"**
- [ ] **Step 3: Commit**

```bash
git add apps/web/components/admin/pipeline/management/ManagementPanel.tsx
git commit -m "feat(pipeline): implement batch save logic in ManagementPanel"
```
