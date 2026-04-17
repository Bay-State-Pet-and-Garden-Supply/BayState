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
  sm: { badge: "text-[10px] px-1.5 py-0 font-black uppercase tracking-tighter", icon: "size-3" },
  md: { badge: "text-xs px-2 py-0.5 font-black uppercase tracking-tighter", icon: "size-3.5" },
  lg: { badge: "text-sm px-2.5 py-1 font-black uppercase tracking-tighter", icon: "size-4" },
};

const statusConfig: Record<
  PipelineDisplayStatus,
  { variant: "default" | "success" | "warning" | "destructive"; label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  imported: { variant: "default", label: "Imported", icon: Package },
  scraping: { variant: "warning", label: "Scraping", icon: Loader2 },
  scraped: { variant: "success", label: "Scraped", icon: Sparkles },
  consolidating: { variant: "warning", label: "Consolidating", icon: Sparkles },
  finalizing: { variant: "warning", label: "Finalizing", icon: CheckCircle2 },
  exporting: { variant: "success", label: "Exporting", icon: Globe },
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
      <span className={cn("animate-pulse rounded-none bg-muted border border-zinc-950", sizeSettings.badge, className)} aria-hidden="true">
        <span className="invisible">Loading</span>
      </span>
    );
  }

  return (
    <Badge 
      variant={config.variant} 
      className={cn(
        sizeSettings.badge, 
        "gap-1.5 rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]", 
        className
      )}
    >
      {(status === "scraping" || status === "consolidating") && (
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
