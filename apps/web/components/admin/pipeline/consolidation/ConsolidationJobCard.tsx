"use client";

import {
  Loader2,
  XCircle,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Zap,
  RotateCcw,
  Cpu,
  Fingerprint,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  formatTimestamp,
  formatElapsed,
  isTerminalStatus,
  getProviderLabel,
  isDirectChatMode,
  isBatchMode,
} from "./shared";
import type { ConsolidationJob } from "./shared";
import { Badge } from "@/components/ui/badge";
import { DirectConsolidationJobView } from "./DirectConsolidationJobView";
import { BatchConsolidationJobView } from "./BatchConsolidationJobView";

// ============================================================================
// Types
// ============================================================================

interface ConsolidationJobCardProps {
  job: ConsolidationJob;
  onCancel: (id: string) => void;
  onApply: (id: string) => void;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onRetryFailed?: (id: string) => void;
  retryingId?: string | null;
  cancellingId: string | null;
  deletingId: string | null;
  applyingId: string | null;
  refreshingId: string | null;
}

// ============================================================================
// ConsolidationJobCard — Router
// ============================================================================

export function ConsolidationJobCard(props: ConsolidationJobCardProps) {
  const { job } = props;
  const executionMode = job.execution_mode;

  // Route to the appropriate view based on execution mode
  if (isDirectChatMode(executionMode)) {
    return (
      <DirectConsolidationJobView
        job={job}
        onCancel={props.onCancel}
        onRefresh={props.onRefresh}
        onDelete={props.onDelete}
        onRetryFailed={props.onRetryFailed}
        retryingId={props.retryingId}
        cancellingId={props.cancellingId}
        deletingId={props.deletingId}
        refreshingId={props.refreshingId}
      />
    );
  }

  // Batch modes (gemini_batch, batch_api) and unknown modes
  return (
    <BatchConsolidationJobView
      job={job}
      onCancel={props.onCancel}
      onApply={props.onApply}
      onRefresh={props.onRefresh}
      onDelete={props.onDelete}
      onRetryFailed={props.onRetryFailed}
      retryingId={props.retryingId}
      cancellingId={props.cancellingId}
      deletingId={props.deletingId}
      applyingId={props.applyingId}
      refreshingId={props.refreshingId}
    />
  );
}
