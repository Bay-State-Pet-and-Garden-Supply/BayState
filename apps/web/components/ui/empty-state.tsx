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
        'border border-dashed border-[oklch(85%_0.03_160)] bg-muted rounded-sm',
        className
      )}
    >
      <div className="flex h-24 w-24 items-center justify-center bg-muted border border-[oklch(85%_0.03_160)] mb-8 rotate-3 shadow-sm">
        <Icon className="h-10 w-10 text-muted-foreground -rotate-3" />
      </div>
      <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground font-display">
        {title}
      </h2>
      <p className="mb-10 max-w-md text-muted-foreground font-medium leading-relaxed">
        {description}
      </p>
      {actionHref ? (
        <Button size="lg" asChild className="h-12 px-8 text-base font-semibold tracking-wide rounded-sm shadow-sm hover:shadow-md transition-all bg-[oklch(72%_0.14_85)] text-[oklch(25%_0.02_90)] hover:bg-[oklch(65%_0.14_85)]">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : onAction ? (
        <Button size="lg" onClick={onAction} className="h-12 px-8 text-base font-semibold tracking-wide rounded-sm shadow-sm hover:shadow-md transition-all bg-[oklch(72%_0.14_85)] text-[oklch(25%_0.02_90)] hover:bg-[oklch(65%_0.14_85)]">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
