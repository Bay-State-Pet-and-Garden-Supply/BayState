'use client';

import { X, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface OfficialDomainsSectionProps {
  domains: string[];
  onDomainsChange: (domains: string[]) => void;
}

export function OfficialDomainsSection({ domains, onDomainsChange }: OfficialDomainsSectionProps) {
  const addDomain = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = e.currentTarget.value.trim().toLowerCase();
      if (value && !domains.includes(value)) {
        onDomainsChange([...domains, value]);
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
          className="h-8 rounded-none border-border bg-background text-xs focus-visible:ring-0 focus-visible:border-brand-gold"
        />
      </div>
    </div>
  );
}
