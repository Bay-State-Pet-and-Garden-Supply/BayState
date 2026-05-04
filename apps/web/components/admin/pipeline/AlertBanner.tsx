import { useState } from "react";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AlertBannerAction {
  /** Label for the action button */
  label: string;
  /** Callback when action is clicked */
  onClick: () => void;
  /** Button variant (default, outline, destructive, etc.) */
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
}

interface AlertBannerProps {
  /** Severity level determines color and icon */
  severity: "error" | "warning" | "info";
  /** Title text for the alert */
  title: string;
  /** Optional message/description */
  message?: string;
  /** Optional action buttons */
  actions?: AlertBannerAction[];
  /** Callback when dismiss button is clicked */
  onDismiss?: () => void;
  /** Additional className */
  className?: string;
}

/**
 * Severity configuration with colors and icons
 */
const severityConfig: Record<
  AlertBannerProps["severity"],
  {
    containerClass: string;
    iconBgClass: string;
    iconClass: string;
    IconComponent: React.ComponentType<{ className?: string }>;
  }
> = {
  error: {
    containerClass:
      "border-red-500/20 bg-red-500/[0.02] dark:border-red-500/10 dark:bg-red-500/[0.01]",
    iconBgClass: "bg-red-500/10 dark:bg-red-500/20",
    iconClass: "text-red-500",
    IconComponent: AlertCircle,
  },
  warning: {
    containerClass:
      "border-amber-500/20 bg-amber-500/[0.02] dark:border-amber-500/10 dark:bg-amber-500/[0.01]",
    iconBgClass: "bg-amber-500/10 dark:bg-amber-500/20",
    iconClass: "text-amber-500",
    IconComponent: AlertTriangle,
  },
  info: {
    containerClass:
      "border-blue-500/20 bg-blue-500/[0.02] dark:border-blue-500/10 dark:bg-blue-500/[0.01]",
    iconBgClass: "bg-blue-500/10 dark:bg-blue-500/20",
    iconClass: "text-blue-500",
    IconComponent: Info,
  },
};

/**
 * AlertBanner component for displaying dismissible alerts with actions.
 * 
 * Features:
 * - Color-coded bordered surface based on severity (error=red, warning=yellow, info=blue)
 * - Appropriate icon for each severity level
 * - Optional dismiss button (top right)
 * - Optional action buttons (e.g., "Retry", "View Logs")
 * - Fully accessible with role="alert", aria-live, and aria-atomic
 * 
 * @example
 * ```tsx
 * <AlertBanner
 *   severity="error"
 *   title="Pipeline Failed"
 *   message="Failed to fetch products from source"
 *   actions={[
 *     { label: "Retry", onClick: () => {}, variant: "outline" },
 *     { label: "View Logs", onClick: () => {} }
 *   ]}
 *   onDismiss={() => handleDismiss()}
 * />
 * ```
 */
export function AlertBanner({
  severity,
  title,
  message,
  actions,
  onDismiss,
  className,
}: AlertBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return null;
  }

  const config = severityConfig[severity];
  const IconComponent = config.IconComponent;

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "relative flex w-full items-start gap-4 rounded-none border border-border bg-background p-4",
        config.containerClass,
        className
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-none border border-border bg-background p-2",
          config.iconClass
        )}
      >
        <IconComponent className="size-5" aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-black uppercase tracking-widest text-foreground">{title}</p>
        {message && (
          <p className="mt-1 text-xs font-black text-muted-foreground/80 leading-tight uppercase tracking-widest">{message}</p>
        )}

        {actions && actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {actions.map((action, index) => (
              <Button
                key={index}
                size="sm"
                variant={action.variant || "outline"}
                onClick={action.onClick}
                className="h-8 rounded-none border border-border text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-all"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Dismiss alert"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
