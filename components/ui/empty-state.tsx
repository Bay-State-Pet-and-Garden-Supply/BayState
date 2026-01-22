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
        'flex flex-col items-center justify-center py-16 text-center px-4',
        'border-2 border-dashed border-border rounded-lg bg-muted/50',
        className
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-6">
        <Icon className="size-[--icon-size-2xl] text-muted-foreground" />
      </div>
      <h2 className="mb-2 text-xl font-[--font-weight-bold] tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mb-8 max-w-sm text-muted-foreground">
        {description}
      </p>
      {actionHref ? (
        <Button size="lg" asChild className="font-semibold">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : onAction ? (
        <Button size="lg" onClick={onAction} className="font-semibold">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
