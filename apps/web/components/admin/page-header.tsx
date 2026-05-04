import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function PageHeader({
  title,
  description,
  icon,
  meta,
  actions,
  className,
  compact,
}: PageHeaderProps) {
  return (
    <div className={cn(compact ? "flex flex-col gap-2" : "flex flex-col gap-4", className)}>
      <div className={cn("flex flex-col sm:flex-row sm:items-start sm:justify-between", compact ? "gap-1" : "gap-1")}>
        <div className="flex items-start gap-3">
          {icon ? (
            <div className={cn(
              "flex shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary",
              compact ? "h-6 w-6 mt-0" : "h-8 w-8 mt-0.5"
            )}>
              {icon}
            </div>
          ) : null}
          <div className={compact ? undefined : "space-y-1"}>
            <h1 className={cn(
              "font-semibold tracking-tight text-foreground",
              compact ? "text-base" : "text-2xl"
            )}>
              {title}
            </h1>
            {description && !compact ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
            {meta ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {meta}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className={cn(
            "flex flex-wrap items-center gap-2",
            compact ? "mt-0 sm:mt-0" : "mt-2 sm:mt-0"
          )}>
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
