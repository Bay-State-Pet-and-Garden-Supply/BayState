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
        'border-4 border-dashed border-zinc-200 bg-zinc-50 rounded-none',
        className
      )}
    >
      <div className="flex h-24 w-24 items-center justify-center bg-zinc-100 border-4 border-zinc-200 mb-8 rotate-3 shadow-[8px_8px_0px_rgba(0,0,0,0.05)]">
        <Icon className="h-10 w-10 text-zinc-400 -rotate-3" />
      </div>
      <h2 className="mb-3 text-3xl font-black uppercase tracking-tighter text-zinc-900 font-display">
        {title}
      </h2>
      <p className="mb-10 max-w-md text-zinc-600 font-medium leading-relaxed">
        {description}
      </p>
      {actionHref ? (
        <Button size="lg" asChild className="h-14 px-10 text-lg font-black uppercase tracking-widest border-b-4 border-black/20 rounded-none shadow-lg active:translate-y-1 active:border-b-0 transition-all">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : onAction ? (
        <Button size="lg" onClick={onAction} className="h-14 px-10 text-lg font-black uppercase tracking-widest border-b-4 border-black/20 rounded-none shadow-lg active:translate-y-1 active:border-b-0 transition-all">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

