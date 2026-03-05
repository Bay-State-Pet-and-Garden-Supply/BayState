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
    className: 'bg-gray-100 text-gray-700 border-gray-300',
  },
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-700 border-green-300',
  },
  disabled: {
    label: 'Disabled',
    className: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  },
  archived: {
    label: 'Archived',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

const healthConfig: Record<HealthStatus, { label: string; className: string; emoji: string }> = {
  healthy: {
    label: 'Healthy',
    className: 'bg-green-100 text-green-700 border-green-300',
    emoji: '',
  },
  degraded: {
    label: 'Degraded',
    className: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    emoji: '',
  },
  broken: {
    label: 'Broken',
    className: 'bg-red-100 text-red-700 border-red-300',
    emoji: '',
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-gray-100 text-gray-600 border-gray-300',
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
