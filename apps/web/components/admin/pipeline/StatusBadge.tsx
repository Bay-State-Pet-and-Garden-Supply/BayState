import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Loader2,
  Package,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PipelineDisplayStatus } from "@/lib/pipeline/types";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: PipelineDisplayStatus;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  showLabel?: boolean;
  isLoading?: boolean;
  className?: string;
}

const sizeConfig = {
  sm: { badge: "text-[10px] px-1.5 py-0 font-semibold", icon: "size-3" },
  md: { badge: "text-xs px-2 py-0.5 font-semibold", icon: "size-3.5" },
  lg: { badge: "text-sm px-2.5 py-1 font-semibold", icon: "size-4" },
};

const statusConfig: Record<
  PipelineDisplayStatus,
  { variant: "default" | "success" | "warning" | "destructive"; label: string; icon: React.ComponentType<{ className?: string }>; color?: string }
> = {
  awaiting_brand: { variant: "default", label: "Awaiting Brand", icon: Package },
  imported: { variant: "default", label: "Imported", icon: Package },
  extracting: { variant: "warning", label: "Extracting", icon: Loader2 },
  processed: { variant: "success", label: "Processed", icon: Sparkles },
  merging: { variant: "warning", label: "Merging", icon: Sparkles },
  reviewing: { variant: "warning", label: "Reviewing", icon: CheckCircle2 },
  publishing: { variant: "success", label: "Publishing", icon: Globe },
  failed: { variant: "destructive", label: "Failed", icon: AlertCircle },
};

const defaultStatusConfig = {
  variant: "default" as const,
  label: "Unknown",
  icon: Package,
};

function PulseDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex size-2", className)} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-none bg-current opacity-75" />
      <span className="relative inline-flex size-2 rounded-none bg-current" />
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
  const config = statusConfig[status] ?? defaultStatusConfig;
  const sizeSettings = sizeConfig[size];
  const Icon = config.icon;

  if (isLoading) {
    return (
      <span className={cn("animate-pulse rounded-none bg-muted border border-border", sizeSettings.badge, className)} aria-hidden="true">
        <span className="invisible">Loading</span>
      </span>
    );
  }

  return (
    <Badge 
      variant={config.variant} 
      className={cn(
        sizeSettings.badge, 
        "gap-1.5 rounded-none border border-border", 
        config.color,
        className
      )}
    >
      {(status === "extracting" || status === "merging") && (
        <PulseDot className={sizeSettings.icon} />
      )}
      {showIcon && <Icon className={sizeSettings.icon} aria-hidden="true" />}
      {showLabel ? (
        <span>{config.label}</span>
      ) : (
        <span className="sr-only">{config.label}</span>
      )}
    </Badge>
  );
}
