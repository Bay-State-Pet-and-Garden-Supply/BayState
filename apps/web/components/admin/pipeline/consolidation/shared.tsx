/**
 * Shared types for consolidation components and provider-neutral status display.
 *
 * These types are used by the existing consolidation UI. For new code,
 * prefer the PipelineRun* types from `@/lib/pipeline/run-types`.
 *
 * Terminology note: This UI uses provider-neutral labels.
 * Provider-specific details (e.g. "DeepSeek", "Direct Chat") are shown
 * only where useful for debugging, never as primary identifiers.
 */

import {
 Loader2,
 Clock,
 CheckCircle2,
 XCircle,
 AlertTriangle,
 RotateCcw,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface ConsolidationJobItemActivity {
 upc: string;
 status: string;
 error_message?: string | null;
 updated_at?: string | null;
 started_at?: string | null;
 completed_at?: string | null;
 created_at?: string | null;
}

export interface ConsolidationJob {
 id: string;
 status: string;
 execution_mode?: string;
 provider?: string | null;
 provider_batch_id?: string | null;
 description: string | null;
 totalProducts: number;
 processedCount: number;
 successCount: number;
 errorCount: number;
 createdAt: string;
 progress: number;
 pendingCount?: number;
 runningCount?: number;
 recentItems?: ConsolidationJobItemActivity[];
 metadata: Record<string, unknown> | null;
}

export interface BatchHistoryJob {
 id: string;
 db_id?: string | null;
 provider?: string | null;
 provider_batch_id?: string | null;
 execution_mode?: string | null;
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

/**
 * Maps database status values to display labels and styles.
 *
 * Provider-specific statuses ("validating", "finalizing", "expired")
 * are mapped to user-friendly provider-neutral labels.
 */
const STATUS_CONFIG: Record<
 string,
 { label: string; color: string; bgColor: string; icon: typeof Loader2 }
> = {
 validating: {
 label: "Queued",
 color: "text-muted-foreground",

 bgColor: "bg-muted",
 icon: Clock,
 },
 pending: {
 label: "Queued",
 color: "text-muted-foreground",

 bgColor: "bg-muted",
 icon: Clock,
 },
 queued: {
 label: "Queued",
 color: "text-muted-foreground",

 bgColor: "bg-muted",
 icon: Clock,
 },
 in_progress: {
 label: "Running",
 color: "text-brand-burgundy",
 bgColor: "bg-brand-burgundy/10",
 icon: Loader2,
 },
 running: {
 label: "Running",
 color: "text-brand-burgundy",
 bgColor: "bg-brand-burgundy/10",
 icon: Loader2,
 },
 finalizing: {
 label: "Running",
 color: "text-brand-burgundy",
 bgColor: "bg-brand-burgundy/10",
 icon: Loader2,
 },
 retrying: {
 label: "Retrying",
 color: "text-brand-gold",
 bgColor: "bg-brand-gold/10",
 icon: RotateCcw,
 },
 completed: {
 label: "Completed",
 color: "text-brand-forest-green",
 bgColor: "bg-brand-forest-green/10",
 icon: CheckCircle2,
 },
 completed_with_errors: {
 label: "Completed with Errors",
 color: "text-brand-gold",
 bgColor: "bg-brand-gold/10",
 icon: AlertTriangle,
 },
 failed: {
 label: "Failed",
 color: "text-destructive",
 bgColor: "bg-destructive/10",
 icon: XCircle,
 },
 expired: {
 label: "Failed",
 color: "text-destructive",
 bgColor: "bg-destructive/10",
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
 const isAnimated = status === "in_progress" || status === "running" || status === "finalizing";

 return (
 <span
 className={`inline-flex items-center gap-1.5 rounded-none border border-current px-2 py-0.5 text-[10px] font-semibold ${config.bgColor} ${config.color}`}
 >
 <Icon className={`h-3 w-3 ${isAnimated ? "animate-spin" : ""}`} />
 {config.label}
 </span>
 );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Display a human-readable provider label from a provider key.
 */
export function getProviderLabel(provider: string | null | undefined): string | null {
  if (!provider) return null;
  switch (provider) {
    case "deepseek":
      return "DeepSeek";
    case "openai":
      return "OpenAI";
    case "openai_compatible":
      return "OpenAI Compatible";
    case "gemini":
      return "Gemini";
    case "lmstudio":
      return "LM Studio";
    default:
      return provider;
  }
}

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
