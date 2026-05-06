import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";

interface AdminPageShellProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  fullHeight?: boolean;
  compactHeader?: boolean;
}

export function AdminPageShell({
  title,
  description,
  icon,
  meta,
  actions,
  children,
  className,
  contentClassName,
  fullHeight,
  compactHeader,
}: AdminPageShellProps) {
  return (
    <div
      className={cn(
        compactHeader ? "flex flex-col gap-3" : "flex flex-col gap-6",
        "flex-1 h-full min-h-0",
        className
      )}
    >
      <PageHeader
        title={title}
        description={description}
        icon={icon}
        meta={meta}
        actions={actions}
        compact={compactHeader}
      />
      <div
        className={cn(
          "flex-1 min-h-0",
          fullHeight ? "overflow-hidden" : "overflow-y-auto",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
