import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  controls?: ReactNode;
  className?: string;
  compact?: boolean;
  eyebrow?: string;
  backHref?: string;
  backLabel?: string;
}

export function PageHeader({
  title,
  description,
  icon,
  meta,
  actions,
  controls,
  className,
  compact,
  eyebrow,
  backHref,
  backLabel = 'Back',
}: PageHeaderProps) {
  return (
    <header className={cn('admin-panel flex flex-col p-5 md:p-6', compact ? 'gap-4' : 'gap-5', className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{backLabel}</span>
        </Link>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 space-y-3">
          {eyebrow ? <p className="admin-kicker">{eyebrow}</p> : null}

          <div className="flex items-start gap-4">
            {icon ? (
              <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--surface-admin-border)] bg-[color:var(--surface-admin-muted)] text-primary">
                {icon}
              </div>
            ) : null}

            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className={cn('admin-page-title', compact && 'text-[1.25rem] md:text-[1.5rem]')}>
                  {title}
                </h1>
                {meta ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {meta}
                  </div>
                ) : null}
              </div>

              {description ? <p className="admin-page-copy">{description}</p> : null}
            </div>
          </div>
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">{actions}</div>
        ) : null}
      </div>

      {controls ? (
        <div className="border-t border-[var(--surface-admin-border)] pt-4">{controls}</div>
      ) : null}
    </header>
  );
}
