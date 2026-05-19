import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from './page-header';

interface AdminPageShellProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  fullHeight?: boolean;
  compactHeader?: boolean;
  eyebrow?: string;
  backHref?: string;
  backLabel?: string;
}

export function AdminPageShell({
  title,
  description,
  icon,
  meta,
  actions,
  controls,
  children,
  className,
  contentClassName,
  fullHeight,
  compactHeader,
  eyebrow,
  backHref,
  backLabel,
}: AdminPageShellProps) {
  return (
    <div
      className={cn(
        compactHeader ? 'flex flex-col gap-4' : 'flex flex-col gap-6',
        'flex-1 min-h-0',
        className,
      )}
    >
      <PageHeader
        title={title}
        description={description}
        icon={icon}
        meta={meta}
        actions={actions}
        controls={controls}
        compact={compactHeader}
        eyebrow={eyebrow}
        backHref={backHref}
        backLabel={backLabel}
      />

      <div
        className={cn(
          'flex-1 min-h-0',
          fullHeight ? 'overflow-hidden' : 'overflow-y-auto pb-6',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
