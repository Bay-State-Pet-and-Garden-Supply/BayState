import { useState } from "react";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AlertBannerAction {
  /** Label for the action button */
  label: string;
  /** Callback when action is clicked */
  onClick: () => void;
  /** Button variant (default, outline, destructive, etc.) */
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
}

export interface AlertBannerProps {
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
      "border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/20",
    iconBgClass: "bg-red-100 dark:bg-red-900/30",
    iconClass: "text-red-600 dark:text-red-400",
    IconComponent: AlertCircle,
  },
  warning: {
    containerClass:
      "border-yellow-200 bg-yellow-50/80 dark:border-yellow-900/40 dark:bg-yellow-950/20",
    iconBgClass: "bg-yellow-100 dark:bg-yellow-900/30",
    iconClass: "text-yellow-600 dark:text-yellow-400",
    IconComponent: AlertTriangle,
  },
  info: {
    containerClass:
      "border-blue-200 bg-blue-50/80 dark:border-blue-900/40 dark:bg-blue-950/20",
    iconBgClass: "bg-blue-100 dark:bg-blue-900/30",
    iconClass: "text-blue-600 dark:text-blue-400",
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
        "relative flex w-full items-start gap-3 rounded-lg border bg-background p-4 shadow-sm",
        config.containerClass,
        className
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full p-1.5",
          config.iconBgClass
        )}
      >
        <IconComponent className={cn("size-5", config.iconClass)} aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        {message && (
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        )}

        {actions && actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action, index) => (
              <Button
                key={index}
                size="sm"
                variant={action.variant || "outline"}
                onClick={action.onClick}
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
          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Dismiss alert"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
