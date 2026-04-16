'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ScraperStatus = 'draft' | 'active' | 'disabled' | 'archived';
type HealthStatus = 'healthy' | 'degraded' | 'broken' | 'unknown';

interface StatusBadgeProps {
  status: ScraperStatus;
  className?: string;
}

interface HealthBadgeProps {
  health: HealthStatus;
  score?: number;
  className?: string;
}

const statusConfig: Record<ScraperStatus, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-zinc-100 text-zinc-600 border-zinc-950',
  },
  active: {
    label: 'Active',
    className: 'bg-brand-forest-green text-white border-zinc-950',
  },
  disabled: {
    label: 'Disabled',
    className: 'bg-brand-gold text-brand-burgundy border-zinc-950',
  },
  archived: {
    label: 'Archived',
    className: 'bg-zinc-100 text-zinc-600 border-zinc-950',
  },
};

const healthConfig: Record<HealthStatus, { label: string; className: string; emoji: string }> = {
  healthy: {
    label: 'Healthy',
    className: 'bg-brand-forest-green/20 text-brand-forest-green border-brand-forest-green/50',
    emoji: '',
  },
  degraded: {
    label: 'Degraded',
    className: 'bg-brand-gold/20 text-brand-burgundy border-brand-gold/50',
    emoji: '',
  },
  broken: {
    label: 'Broken',
    className: 'bg-brand-burgundy/10 text-brand-burgundy border-brand-burgundy/30',
    emoji: '',
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-zinc-100 text-zinc-600 border-zinc-950',
    emoji: '',
  },
};

export function ScraperStatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Badge
      variant="outline"
      className={cn(config.className, 'font-medium', className)}
    >
      {config.label}
    </Badge>
  );
}

export function ScraperHealthBadge({ health, score, className }: HealthBadgeProps) {
  const config = healthConfig[health] || healthConfig.unknown;

  return (
    <Badge
      variant="outline"
      className={cn(config.className, 'font-medium', className)}
    >
      {config.emoji} {config.label}
      {typeof score === 'number' && health !== 'unknown' && (
        <span className="ml-1 opacity-70">({score}%)</span>
      )}
    </Badge>
  );
}
