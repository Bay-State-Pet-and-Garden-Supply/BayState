import Link from 'next/link';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 text-center px-6',
        'rounded-3xl border border-dashed border-zinc-300 bg-zinc-50/80',
        className
      )}
    >
      <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <Icon className="h-10 w-10 text-zinc-400" />
      </div>
      <h2 className="mb-3 text-3xl font-bold text-zinc-900 font-display">
        {title}
      </h2>
      <p className="mb-10 max-w-md text-zinc-600 font-medium leading-relaxed">
        {description}
      </p>
      {actionHref ? (
        <Button size="lg" asChild className="h-14 px-10 text-lg font-semibold rounded-xl shadow-sm hover:shadow-md">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : onAction ? (
        <Button size="lg" onClick={onAction} className="h-14 px-10 text-lg font-semibold rounded-xl shadow-sm hover:shadow-md">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
