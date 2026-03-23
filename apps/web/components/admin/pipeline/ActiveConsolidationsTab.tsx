"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Brain,
  Loader2,
  XCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Zap,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Key, Save, CheckCircle } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface ConsolidationJob {
  id: string;
  status: string;
  totalProducts: number;
  processedCount: number;
  successCount: number;
  errorCount: number;
  createdAt: string;
  progress: number;
}

interface BatchHistoryJob {
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

interface AISettings {
  defaults: {
    llm_model: string;
    max_search_results: number;
    max_steps: number;
    confidence_threshold: number;
  };
  statuses: {
    openai: {
      configured: boolean;
      last4: string | null;
      updated_at: string | null;
    };
    brave: {
      configured: boolean;
      last4: string | null;
      updated_at: string | null;
    };
  };
}

interface ActiveConsolidationsTabProps {
  className?: string;
}

// ============================================================================
// Status Badge Configuration
// ============================================================================

const STATUS_CONFIG: Record<
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

function StatusBadge({ status }: { status: string }) {
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

function formatElapsed(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isTerminalStatus(status: string): boolean {
  return ["completed", "failed", "expired", "cancelled"].includes(status);
}

// ============================================================================
// Active Job Card
// ============================================================================

function ActiveJobCard({
  job,
  onCancel,
  onApply,
  onSyncStatus,
  cancellingId,
  applyingId,
  syncingId,
}: {
  job: ConsolidationJob;
  onCancel: (id: string) => void;
  onApply: (id: string) => void;
  onSyncStatus: (id: string) => void;
  cancellingId: string | null;
  applyingId: string | null;
  syncingId: string | null;
}) {
  return (
    <div className="rounded-lg border border-purple-100 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-brand-burgundy" />
            <h3 className="font-medium text-foreground">
              Batch {job.id.slice(0, 12)}
            </h3>
            <StatusBadge status={job.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Started {formatTimestamp(job.createdAt)} •{" "}
            {formatElapsed(job.createdAt)} ago
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSyncStatus(job.id)}
            disabled={syncingId === job.id}
            title="Refresh status from OpenAI"
            className="text-muted-foreground hover:text-muted-foreground"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncingId === job.id ? "animate-spin" : ""}`}
            />
          </Button>
          {!isTerminalStatus(job.status) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancel(job.id)}
              disabled={cancellingId === job.id}
              title="Cancel batch"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {cancellingId === job.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-3 grid grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-2xl font-semibold text-foreground">
            {job.totalProducts}
          </p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-blue-600">
            {job.processedCount}
          </p>
          <p className="text-xs text-muted-foreground">Processed</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-green-600">
            {job.successCount}
          </p>
          <p className="text-xs text-muted-foreground">Success</p>
        </div>
        <div>
          <p
            className={`text-2xl font-semibold ${job.errorCount > 0 ? "text-red-600" : "text-foreground"}`}
          >
            {job.errorCount}
          </p>
          <p className="text-xs text-muted-foreground">Errors</p>
        </div>
      </div>

      {/* Error Warning */}
      {job.errorCount > 0 && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          {job.errorCount} product{job.errorCount !== 1 ? "s" : ""} failed
          consolidation
        </div>
      )}

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium text-foreground">{job.progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand-burgundy transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Apply Button for completed batches */}
      {job.status === "completed" && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => onApply(job.id)}
            disabled={applyingId === job.id}
            className="bg-[#008850] hover:bg-[#006b40] text-white"
          >
            {applyingId === job.id ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Apply Results
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Batch History Card
// ============================================================================

function BatchHistoryCard({
  job,
  onApply,
  applyingId,
}: {
  job: BatchHistoryJob;
  onApply: (id: string) => void;
  applyingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const metadata = job.metadata || {};
  const applySummary = metadata.apply_summary as
    | Record<string, unknown>
    | undefined;
  const qualityMetrics = metadata.quality_metrics as
    | Record<string, number>
    | undefined;
  const isApplied = !!applySummary;
  const canApply = job.status === "completed" && !isApplied;

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status={job.status} />
          <span className="text-sm font-medium text-foreground truncate">
            {job.description || `Batch ${job.id.slice(0, 12)}`}
          </span>
          {job.auto_apply && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700"
            >
              Auto
            </Badge>
          )}
          {isApplied && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700"
            >
              Applied
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canApply && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onApply(job.openai_batch_id || job.id)}
              disabled={applyingId === (job.openai_batch_id || job.id)}
              className="text-xs"
            >
              {applyingId === (job.openai_batch_id || job.id) ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Zap className="mr-1 h-3 w-3" />
              )}
              Apply
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-muted-foreground"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatTimestamp(job.created_at)}</span>
        <span>•</span>
        <span>{job.total_requests} products</span>
        {job.completed_requests > 0 && (
          <>
            <span>•</span>
            <span className="text-green-600">
              {job.completed_requests} success
            </span>
          </>
        )}
        {job.failed_requests > 0 && (
          <>
            <span>•</span>
            <span className="text-red-600">{job.failed_requests} failed</span>
          </>
        )}
        {job.estimated_cost > 0 && (
          <>
            <span>•</span>
            <span>${job.estimated_cost.toFixed(4)}</span>
          </>
        )}
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Batch ID:</span>
              <span className="ml-1 font-mono text-muted-foreground">
                {job.openai_batch_id || job.id}
              </span>
            </div>
            {job.completed_at && (
              <div>
                <span className="text-muted-foreground">Completed:</span>
                <span className="ml-1 text-muted-foreground">
                  {formatTimestamp(job.completed_at)}
                </span>
              </div>
            )}
          </div>

          {/* Quality Metrics */}
          {qualityMetrics && (
            <div className="rounded-md bg-muted p-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Quality Metrics
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>
                  Matched brands: {qualityMetrics.matched_brand_count ?? 0}
                </span>
                <span>
                  Unresolved brands:{" "}
                  {qualityMetrics.unresolved_brand_count ?? 0}
                </span>
                <span>
                  Fields overwritten:{" "}
                  {qualityMetrics.overwritten_field_count ?? 0}
                </span>
                <span>
                  Fields preserved:{" "}
                  {qualityMetrics.preserved_existing_field_count ?? 0}
                </span>
              </div>
            </div>
          )}

          {/* Apply Summary */}
          {applySummary && (
            <div className="rounded-md bg-green-50 p-2">
              <p className="text-xs font-medium text-green-700 mb-1">
                Apply Summary
              </p>
              <div className="flex items-center gap-3 text-xs text-green-600">
                <span>
                  {(applySummary.success_count as number) ?? 0} applied
                </span>
                <span>{(applySummary.error_count as number) ?? 0} errors</span>
                <span>{(applySummary.total as number) ?? 0} total</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AI Settings Dialog
// ============================================================================

function AISettingsDialog() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/consolidation/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error("Failed to fetch AI settings", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSaveDefaults = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/consolidation/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings.defaults),
      });
      if (res.ok) {
        toast.success("Defaults saved");
        await fetchSettings();
      } else {
        toast.error("Failed to save defaults");
      }
    } catch {
      toast.error("Failed to save defaults");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKey = async () => {
    if (!openaiKey.trim()) {
      toast.error("API key cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/consolidation/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openai_api_key: openaiKey }),
      });
      if (res.ok) {
        toast.success("OpenAI API Key updated");
        setOpenaiKey("");
        await fetchSettings();
      } else {
        toast.error("Failed to update API Key");
      }
    } catch {
      toast.error("Failed to update API Key");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (open) fetchSettings();
  }, [open, fetchSettings]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          AI Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>AI Consolidation Settings</DialogTitle>
          <DialogDescription>
            Configure OpenAI credentials and default models for consolidation.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* API Key Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-brand-burgundy" />
              <h4 className="text-sm font-semibold">OpenAI API Key</h4>
            </div>

            <div className="rounded-md border border-border bg-muted p-3">
              {settings?.statuses.openai.configured ? (
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-xs text-green-700">
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>Configured (Ends in {settings.statuses.openai.last4})</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Updated {settings.statuses.openai.updated_at ? new Date(settings.statuses.openai.updated_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 mb-3">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Not Configured</span>
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="sk-..."
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 px-3 text-xs"
                  onClick={handleSaveKey}
                  disabled={saving || !openaiKey}
                >
                  Update
                </Button>
              </div>
            </div>
          </div>

          {/* Model Selection Section */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-brand-burgundy" />
              <h4 className="text-sm font-semibold">Consolidation Defaults</h4>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="model" className="text-xs">Model</Label>
                <select
                  id="model"
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={settings?.defaults.llm_model || "gpt-4o-mini"}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            defaults: {
                              ...prev.defaults,
                              llm_model: e.target.value as "gpt-4o" | "gpt-4o-mini",
                            },
                          }
                        : null
                    )
                  }
                >
                  <option value="gpt-4o-mini">GPT-4o Mini (Cost Effective)</option>
                  <option value="gpt-4o">GPT-4o (High Performance)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confidence" className="text-xs">Min Confidence</Label>
                <Input
                  id="confidence"
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="h-8 text-xs"
                  value={settings?.defaults.confidence_threshold || 0.7}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            defaults: {
                              ...prev.defaults,
                              confidence_threshold: parseFloat(e.target.value),
                            },
                          }
                        : null
                    )
                  }
                />
              </div>
            </div>

            <Button
              className="w-full h-8 text-xs"
              variant="secondary"
              onClick={handleSaveDefaults}
              disabled={saving || !settings}
            >
              <Save className="mr-2 h-3.5 w-3.5" />
              Save Default Parameters
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ActiveConsolidationsTab({
  className,
}: ActiveConsolidationsTabProps) {
  const [jobs, setJobs] = useState<ConsolidationJob[]>([]);
  const [historyJobs, setHistoryJobs] = useState<BatchHistoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch active consolidation jobs
  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/pipeline/active-consolidations");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      const data = await response.json();
      const activeJobs = data.jobs || [];
      setJobs(activeJobs);
      
      // If no active jobs, show history automatically
      if (activeJobs.length === 0) {
        setShowHistory(true);
      }
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch batch history
  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/consolidation/jobs");
      if (!response.ok) return;
      const data = await response.json();
      setHistoryJobs(data.jobs || []);
    } catch {
      // Silently fail for history
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchHistory();
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [fetchJobs, fetchHistory]);

  // Cancel a batch
  const handleCancel = async (batchId: string) => {
    if (!confirm("Cancel this consolidation batch? This cannot be undone."))
      return;

    setCancellingId(batchId);
    try {
      const res = await fetch(`/api/admin/consolidation/${batchId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Batch cancelled");
        await Promise.all([fetchJobs(), fetchHistory()]);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to cancel batch");
      }
    } catch {
      toast.error("Failed to cancel batch");
    } finally {
      setCancellingId(null);
    }
  };

  // Apply results from a completed batch
  const handleApply = async (batchId: string) => {
    setApplyingId(batchId);
    try {
      const res = await fetch(`/api/admin/consolidation/${batchId}/apply`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        const successCount = data.success_count ?? 0;
        const errorCount = data.error_count ?? 0;
        toast.success(
          `Applied ${successCount} product${successCount !== 1 ? "s" : ""}` +
            (errorCount > 0
              ? ` (${errorCount} error${errorCount !== 1 ? "s" : ""})`
              : ""),
        );
        await Promise.all([fetchJobs(), fetchHistory()]);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to apply results");
      }
    } catch {
      toast.error("Failed to apply results");
    } finally {
      setApplyingId(null);
    }
  };

  // Sync status for a single batch from OpenAI
  const handleSyncStatus = async (batchId: string) => {
    setSyncingId(batchId);
    try {
      const res = await fetch(`/api/admin/consolidation/${batchId}`);
      if (res.ok) {
        toast.success("Status refreshed");
        await Promise.all([fetchJobs(), fetchHistory()]);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to sync status");
      }
    } catch {
      toast.error("Failed to sync status");
    } finally {
      setSyncingId(null);
    }
  };

  // Sync all active batches
  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await fetch("/api/admin/consolidation/sync", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Synced ${data.synced_count ?? 0} batch${(data.synced_count ?? 0) !== 1 ? "es" : ""}`,
        );
        await Promise.all([fetchJobs(), fetchHistory()]);
      } else {
        toast.error("Failed to sync batches");
      }
    } catch {
      toast.error("Failed to sync batches");
    } finally {
      setSyncingAll(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}
      >
        <p className="text-sm text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {jobs.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {jobs.length} active batch{jobs.length !== 1 ? "es" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AISettingsDialog />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncAll}
            disabled={syncingAll}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${syncingAll ? "animate-spin" : ""}`}
            />
            Sync All
          </Button>
          <Button
            variant={showHistory ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) fetchHistory();
            }}
          >
            <History className="mr-2 h-4 w-4" />
            History
          </Button>
        </div>
      </div>

      {/* Active Jobs */}
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Brain className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-foreground">
            No active consolidation jobs
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            AI consolidation jobs will appear here when running
          </p>
        </div>
      ) : (
        jobs.map((job) => (
          <ActiveJobCard
            key={job.id}
            job={job}
            onCancel={handleCancel}
            onApply={handleApply}
            onSyncStatus={handleSyncStatus}
            cancellingId={cancellingId}
            applyingId={applyingId}
            syncingId={syncingId}
          />
        ))
      )}

      {/* Batch History Section */}
      {showHistory && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-t pt-4">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">
              Recent Batches
            </h3>
            <span className="text-xs text-muted-foreground">Last 20</span>
          </div>

          {historyJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No batch history yet
            </p>
          ) : (
            historyJobs.map((job) => (
              <BatchHistoryCard
                key={job.id}
                job={job}
                onApply={handleApply}
                applyingId={applyingId}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
