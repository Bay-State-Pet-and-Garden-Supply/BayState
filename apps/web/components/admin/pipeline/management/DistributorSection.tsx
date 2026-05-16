'use client';

import { cn } from '@/lib/utils';
import { ShieldCheck, ShieldAlert, Shield, Loader2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const APPROVED_DISTRIBUTORS = [
  { id: 'bradley_crawl4ai', label: 'Bradley Caldwell', requiresAuth: false },
  { id: 'phillips_crawl4ai', label: 'Phillips Pet', requiresAuth: true, slug: 'phillips' },
  { id: 'pet_food_experts_crawl4ai', label: 'Pet Food Experts', requiresAuth: true, slug: 'petfoodex' },
  { id: 'central_pet_crawl4ai', label: 'Central Pet', requiresAuth: false },
  { id: 'orgill_crawl4ai', label: 'Orgill', requiresAuth: true, slug: 'orgill' },
];

interface DistributorSectionProps {
  activeScrapers: string[];
  onToggleScraper: (id: string) => void;
  credentialStatuses: Record<string, { configured: boolean; loading: boolean }>;
}

export function DistributorSection({
  activeScrapers,
  onToggleScraper,
  credentialStatuses,
}: DistributorSectionProps) {
  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-muted-foreground" />
        3. Distributor Sources (Adapter Sync)
      </label>

      <div className="grid grid-cols-1 gap-2">
        {APPROVED_DISTRIBUTORS.map((dist) => {
          const isActive = activeScrapers.includes(dist.id);

          // Resolve Auth requirements and status
          if (!dist.requiresAuth) {
            // No Auth required: always available and toggleable
            return (
              <button
                key={dist.id}
                type="button"
                onClick={() => onToggleScraper(dist.id)}
                className={cn(
                  "flex items-center justify-between p-3 border text-left transition-all rounded-none",
                  isActive
                    ? "border-brand-forest-green bg-brand-forest-green/5 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isActive
                        ? "bg-brand-forest-green shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        : "bg-muted"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">{dist.label}</span>
                    <span className="text-[9px] text-muted-foreground font-semibold flex items-center gap-1 mt-0.5">
                      <Shield className="h-3 w-3 text-brand-forest-green" /> No Auth Required
                    </span>
                  </div>
                </div>
                <span className={cn(
                  "text-[9px] font-bold uppercase tracking-widest",
                  isActive ? "text-brand-forest-green" : "text-muted-foreground"
                )}>
                  {isActive ? "Enabled" : "Disabled"}
                </span>
              </button>
            );
          }

          // Requires Auth: check credential status
          const status = credentialStatuses[dist.slug!] || { configured: false, loading: true };

          if (status.loading) {
            return (
              <div
                key={dist.id}
                className="flex items-center justify-between p-3 border border-border bg-card opacity-70"
              >
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-muted-foreground">{dist.label}</span>
                    <span className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                      Checking credentials...
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          if (!status.configured) {
            // Credentials are NOT configured: disabled and show config link
            return (
              <div
                key={dist.id}
                className="flex flex-col p-3 border border-dashed border-destructive/45 bg-destructive/[0.01] text-muted-foreground"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-destructive/30" />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-muted-foreground/80">{dist.label}</span>
                      <span className="text-[9px] text-destructive font-semibold flex items-center gap-1 mt-0.5">
                        <ShieldAlert className="h-3 w-3" /> Credentials Missing
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-destructive/70">
                    Blocked
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-border/50 flex justify-end">
                  <Link
                    href="/admin/settings"
                    className="text-[9px] font-bold text-brand-burgundy hover:underline flex items-center gap-1 transition-colors"
                  >
                    Configure in Settings <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          }

          // Credentials ARE configured: fully available and toggleable
          return (
            <button
              key={dist.id}
              type="button"
              onClick={() => onToggleScraper(dist.id)}
              className={cn(
                "flex items-center justify-between p-3 border text-left transition-all rounded-none",
                isActive
                  ? "border-brand-forest-green bg-brand-forest-green/5 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    isActive
                      ? "bg-brand-forest-green shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                      : "bg-muted"
                  )}
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">{dist.label}</span>
                  <span className="text-[9px] text-brand-forest-green font-semibold flex items-center gap-1 mt-0.5">
                    <ShieldCheck className="h-3 w-3" /> Credentials Configured
                  </span>
                </div>
              </div>
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-widest",
                isActive ? "text-brand-forest-green" : "text-muted-foreground"
              )}>
                {isActive ? "Enabled" : "Disabled"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
