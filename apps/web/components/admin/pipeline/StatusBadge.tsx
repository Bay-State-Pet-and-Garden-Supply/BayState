import { Package, Sparkles, CheckCircle2, Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PipelineStatus } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: PipelineStatus;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  showLabel?: boolean;
  isLoading?: boolean;
  className?: string;
}

const sizeConfig = {
  sm: { badge: "text-[10px] px-1.5 py-0", icon: "size-3" },
  md: { badge: "text-xs px-2 py-0.5", icon: "size-3.5" },
  lg: { badge: "text-sm px-2.5 py-1", icon: "size-4" },
};

const statusConfig: Record<
  PipelineStatus,
  { variant: "default" | "success" | "warning" | "destructive"; label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  imported: { variant: "default", label: "Imported", icon: Package },
  scraped: { variant: "success", label: "Scraped", icon: Sparkles },
  consolidated: { variant: "warning", label: "Consolidated", icon: CheckCircle2 },
  finalized: { variant: "warning", label: "Finalized", icon: CheckCircle2 },
  published: { variant: "success", label: "Published", icon: Globe },
};

function PulseDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex size-2", className)} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-current" />
    </span>
  );
}

export function StatusBadge({
  status,
  size = "md",
  showIcon = true,
  showLabel = true,
  isLoading = false,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status];
  const sizeSettings = sizeConfig[size];
  const Icon = config.icon;

  if (isLoading) {
    return (
      <span className={cn("animate-pulse rounded-full bg-muted", sizeSettings.badge, className)} aria-hidden="true">
        <span className="invisible">Loading</span>
      </span>
    );
  }

  return (
    <Badge variant={config.variant} className={cn(sizeSettings.badge, "gap-1.5", className)}>
      {status === "scraped" && <PulseDot className={sizeSettings.icon} />}
      {showIcon && <Icon className={sizeSettings.icon} aria-hidden="true" />}
      {showLabel ? (
        <span>{config.label}</span>
      ) : (
        <span className="sr-only">{config.label}</span>
      )}
    </Badge>
  );
}
