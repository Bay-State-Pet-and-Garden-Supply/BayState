import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  controls?: React.ReactNode;
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
    <header
      className={cn(
        'admin-panel flex flex-col transition-all duration-200',
        compact ? 'p-3 md:p-4 gap-3' : 'py-4 px-5 md:py-5 md:px-6 gap-4',
        className
      )}
    >
      {/* Top Breadcrumb/Back link and Eyebrow Row */}
      {(backHref || eyebrow) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/80 leading-none">
          {backHref && (
            <>
              <Link
                href={backHref}
                className="group inline-flex items-center gap-1 font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
                <span>{backLabel}</span>
              </Link>
              {eyebrow && <span className="text-muted-foreground/30 font-light">|</span>}
            </>
          )}
          {eyebrow && (
            <span className="admin-kicker uppercase tracking-wider font-bold text-[0.6875rem]">{eyebrow}</span>
          )}
        </div>
      )}

      {/* Main Title, Icon, Meta & Actions Section */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {icon ? (
              <div
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-xl border border-[var(--surface-admin-border)] bg-[color:var(--surface-admin-muted)] text-primary transition-all [&_svg]:h-5 [&_svg]:w-5',
                  compact ? 'h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4' : 'h-10 w-10'
                )}
              >
                {icon}
              </div>
            ) : null}

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2 md:gap-3">
                <h1
                  className={cn(
                    'font-semibold tracking-tight text-foreground transition-colors',
                    compact
                      ? 'text-lg md:text-xl'
                      : 'text-[1.25rem] md:text-[1.5rem] lg:text-[1.625rem]'
                  )}
                >
                  {title}
                </h1>
                {meta ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {meta}
                  </div>
                ) : null}
              </div>

              {description && !compact ? (
                <p className="admin-page-copy text-xs md:text-sm text-muted-foreground leading-normal mt-0.5">
                  {description}
                </p>
              ) : null}
              {description && compact ? (
                <p className="admin-page-copy text-xs text-muted-foreground/80 leading-normal mt-0.5 line-clamp-1 max-w-[85ch]">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>

      {/* Optional Filter/Tab Controls */}
      {controls ? (
        <div className="border-t border-[var(--surface-admin-border)] pt-3 mt-1">
          {controls}
        </div>
      ) : null}
    </header>
  );
}
