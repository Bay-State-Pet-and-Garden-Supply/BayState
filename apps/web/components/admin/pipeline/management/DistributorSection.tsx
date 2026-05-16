'use client';

import { cn } from '@/lib/utils';

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
