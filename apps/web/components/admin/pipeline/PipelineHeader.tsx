import { Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PipelineHeaderProps {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}

export function PipelineHeader({
  title,
  subtitle,
  icon: Icon = Package,
  actions,
}: PipelineHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-[10px] font-semibold text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}
