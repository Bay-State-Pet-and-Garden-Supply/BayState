import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const toneClasses = {
  default: 'text-foreground bg-muted/70',
  success: 'text-brand-forest-green bg-brand-forest-green/10',
  warning: 'text-amber-700 bg-amber-100',
  danger: 'text-brand-burgundy bg-brand-burgundy/10',
} as const;

interface AdminStatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof toneClasses;
  className?: string;
}

export function AdminStatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
}: AdminStatCardProps) {
  return (
    <div className={cn('admin-panel flex min-h-[132px] flex-col justify-between gap-5 p-4 md:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', toneClasses[tone])}>
            {icon}
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <p className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}
