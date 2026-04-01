import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface ConsolidationJob {
  id: string;
  status: string;
  totalProducts: number;
  processedCount: number;
  successCount: number;
  errorCount: number;
  createdAt: string;
  progress: number;
}

export interface BatchHistoryJob {
  id: string;
  openai_batch_id: string | null;
  status: string;
  description: string | null;
  auto_apply: boolean;
  total_requests: number;
  completed_requests: number;
  failed_requests: number;
  estimated_cost: number;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

// ============================================================================
// Status Badge Configuration
// ============================================================================

export const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; icon: typeof Loader2 }
> = {
  validating: {
    label: "Validating",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    icon: Clock,
  },
  pending: {
    label: "Pending",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    icon: Loader2,
  },
  finalizing: {
    label: "Finalizing",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    icon: Loader2,
  },
  completed: {
    label: "Completed",
    color: "text-green-700",
    bgColor: "bg-green-50",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    color: "text-red-700",
    bgColor: "bg-red-50",
    icon: XCircle,
  },
  expired: {
    label: "Expired",
    color: "text-red-700",
    bgColor: "bg-red-50",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    icon: XCircle,
  },
};

// ============================================================================
// StatusBadge Component
// ============================================================================

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  const isAnimated = status === "in_progress" || status === "finalizing";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.color}`}
    >
      <Icon className={`h-3 w-3 ${isAnimated ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}

// ============================================================================
// Helpers
// ============================================================================

export function formatElapsed(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isTerminalStatus(status: string): boolean {
  return ["completed", "failed", "expired", "cancelled"].includes(status);
}
