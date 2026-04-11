"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Brain,
  Loader2,
  RefreshCw,
  AlertTriangle,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Key, Save, CheckCircle } from "lucide-react";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { ConsolidationJobCard } from "@/components/admin/pipeline/consolidation";
import { BatchHistorySection } from "@/components/admin/pipeline/consolidation";
import type {
  ConsolidationJob,
  BatchHistoryJob,
} from "@/components/admin/pipeline/consolidation";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";
import { DEFAULT_AI_MODEL } from "@/lib/ai-scraping/models";

// ============================================================================
// Types
// ============================================================================

interface AISettings {
  defaults: {
    llm_provider?: "openai";
    llm_model: string;
    llm_base_url?: string | null;
    llm_supports_batch_api?: boolean;
    confidence_threshold: number;
  };
  statuses: {
    openai: {
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
// AI Settings Dialog
// ============================================================================

function AISettingsDialog() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/consolidation/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error("Failed to fetch AI settings", err);
    }
  }, []);

  const handleSaveDefaults = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/consolidation/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings.defaults,
          llm_provider: "openai",
          llm_base_url: null,
          llm_supports_batch_api: true,
        }),
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
                  value={settings?.defaults.llm_model || DEFAULT_AI_MODEL}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            defaults: {
                            ...prev.defaults,
                              llm_model: e.target.value as "gpt-4o-mini" | "gpt-4o",
                            },
                          }
                        : null
                    )
                  }
                >
                  <option value="gpt-4o-mini">GPT-4o mini</option>
                  <option value="gpt-4o">GPT-4o</option>
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
  const isDocumentVisible = useDocumentVisible();
  const [jobs, setJobs] = useState<ConsolidationJob[]>([]);
  const [historyJobs, setHistoryJobs] = useState<BatchHistoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [pendingCancelBatchId, setPendingCancelBatchId] = useState<string | null>(null);
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
    void Promise.all([fetchJobs(), fetchHistory()]);
  }, [fetchJobs, fetchHistory]);

  useEffect(() => {
    if (!isDocumentVisible || jobs.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      void Promise.all([fetchJobs(), fetchHistory()]);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchHistory, fetchJobs, isDocumentVisible, jobs.length]);

  // Cancel a batch
  const handleCancelClick = (batchId: string) => {
    setPendingCancelBatchId(batchId);
    setConfirmCancelOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!pendingCancelBatchId) return;
    setConfirmCancelOpen(false);

    const batchId = pendingCancelBatchId;
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

    setPendingCancelBatchId(null);
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

  // Sync status for a single batch from the configured provider
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
          <ConsolidationJobCard
            key={job.id}
            job={job}
            onCancel={handleCancelClick}
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
        <BatchHistorySection
          historyJobs={historyJobs}
          onApply={handleApply}
          applyingId={applyingId}
        />
      )}

      <ConfirmationDialog
        open={confirmCancelOpen}
        onOpenChange={(open) => {
          setConfirmCancelOpen(open);
          if (!open) setPendingCancelBatchId(null);
        }}
        onConfirm={handleConfirmCancel}
        title="Cancel Consolidation Batch"
        description="Cancel this consolidation batch? This cannot be undone."
        confirmLabel="Cancel Batch"
        variant="destructive"
        isLoading={!!cancellingId}
      />
    </div>
  );
}
