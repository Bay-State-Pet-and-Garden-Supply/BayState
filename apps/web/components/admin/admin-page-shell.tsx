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
}: AdminPageShellProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6",
        fullHeight && "h-full min-h-0",
        className
      )}
    >
      <PageHeader
        title={title}
        description={description}
        icon={icon}
        meta={meta}
        actions={actions}
      />
      <div
        className={cn(
          "flex-1 min-h-0",
          fullHeight && "overflow-hidden",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
