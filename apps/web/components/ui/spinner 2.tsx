import { cn } from "@/lib/utils"

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg"
}

const sizeClasses = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-3",
}

/**
 * Spinner - A unified loading spinner component.
 * Provides consistent sizing and styling for loading states.
 *
 * @example
 * <Spinner size="sm" /> - Small spinner (16px)
 * <Spinner size="md" /> - Medium spinner (24px) - default
 * <Spinner size="lg" /> - Large spinner (32px)
 */
export function Spinner({ size = "md", className, ...props }: SpinnerProps) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-primary border-t-transparent",
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label="Loading"
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  )
}

/**
 * SpinnerOverlay - A full-screen or container overlay with a centered spinner.
 * Use for page-level loading states.
 */
interface SpinnerOverlayProps {
  className?: string
  message?: string
}

export function SpinnerOverlay({ className, message }: SpinnerOverlayProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Spinner size="lg" />
      {message && (
        <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      )}
      <span className="sr-only">{message || "Loading..."}</span>
    </div>
  )
}
