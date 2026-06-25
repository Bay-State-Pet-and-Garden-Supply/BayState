"use client";

import { useEffect, useMemo, useCallback, useState, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Activity, AlertCircle, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { adminFetch } from "@/lib/admin/api-client";
import { useJobSubscription } from "@/lib/realtime/useJobSubscription";
import { useAttemptsSubscription } from "@/lib/realtime/useAttemptsSubscription";

import { ExtractingSidebarList } from "./ExtractingSidebarList";
import { ExtractingDetailPane } from "./ExtractingDetailPane";
import {
  compareMonitoringJobs,
  CascadeProductProgress,
  getCascadeProductStatus,
  getSourceProgressLabel,
  isCascadeProductOrphaned,
} from "./extracting-utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ActiveEnrichmentsTab() {
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedJobId = searchParams.get("jobId") || null;

  const {
    jobs: realtimeJobs,
    error: jobsError,
    refetch: forceSyncJobs,
  } = useJobSubscription({
    maxJobsPerStatus: 50,
  });

  const {
    attempts: selectedJobAttempts,
    isConnected: isAttemptsConnected,
    error: attemptsError,
  } = useAttemptsSubscription({
    jobId: selectedJobId,
    autoConnect: Boolean(selectedJobId),
  });

  useEffect(() => {
    if (!searchParams.get("attemptId")) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("attemptId");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  const resolveJob = async ({
    jobId,
    confirmMessage,
    successMessage,
    errorMessage,
  }: {
    jobId: string;
    confirmMessage: string;
    successMessage: string;
    errorMessage: string;
  }) => {
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setCancellingJobId(jobId);
    try {
      const res = await adminFetch(`/api/admin/pipeline/runs/${jobId}/cancel`, {
        method: "POST",
      });
      if (res.status === 404) {
        toast.info("The enrichment pipeline has been removed. This job is no longer active.");
        void forceSyncJobs();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(successMessage);
        void forceSyncJobs();
      } else {
        toast.error(data.error || errorMessage);
      }
    } catch (err) {
      console.error("Error resolving enrichment job:", err);
      toast.error(errorMessage);
    } finally {
      setCancellingJobId(null);
    }
  };

  // ---- Cascade product view state ----
  const [extractingProducts, setExtractingProducts] = useState<CascadeProductProgress[]>([]);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [selectedCascadeUpc, setSelectedCascadeUpc] = useState<string | null>(null);
  const cascadeFetchedRef = useRef(false);

  const fetchCascadeProducts = useCallback(async () => {
    setCascadeLoading(true);
    try {
      // 1. Fetch products in extracting status
      const pipelineRes = await adminFetch("/api/admin/pipeline?stage=extracting&limit=500", {
        cache: "no-store",
      });
      if (!pipelineRes.ok) {
        console.warn("[CascadeView] Failed to fetch extracting products");
        return;
      }
      const pipelineData = await pipelineRes.json();
      const products: Array<{ upc: string; input?: { name?: string | null } | null }> =
        pipelineData.products ?? [];

      if (products.length === 0) {
        setExtractingProducts([]);
        return;
      }

      const upcs = products.map((p) => p.upc);
      const upcToName = new Map(products.map((p) => [p.upc, p.input?.name ?? null]));

      // 2. Get extraction progress per UPC
      const progressRes = await adminFetch("/api/admin/pipeline/extraction-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upcs }),
      });
      if (!progressRes.ok) {
        console.warn("[CascadeView] Failed to fetch extraction progress");
        return;
      }
      const progressData = await progressRes.json();
      const progressMap: Record<string, any> = progressData.progress ?? {};

      // 3. Merge into CascadeProductProgress array
      const merged: CascadeProductProgress[] = upcs.map((upc) => {
        const p = progressMap[upc] ?? {
          attemptStatus: null,
          claimed: false,
          runnerName: null,
          sourceCounts: { found: 0, not_stocked: 0, source_error: 0, skipped: 0 },
          totalSources: 0,
          sourceOutcomes: [],
        };
        return {
          upc,
          productName: upcToName.get(upc) ?? null,
          attemptStatus: p.attemptStatus ?? null,
          claimed: p.claimed ?? false,
          runnerName: p.runnerName ?? null,
          sourceCounts: p.sourceCounts ?? { found: 0, not_stocked: 0, source_error: 0, skipped: 0 },
          totalSources: p.totalSources ?? 0,
          sourceOutcomes: p.sourceOutcomes ?? [],
        };
      });

      setExtractingProducts(merged);
    } catch (err) {
      console.error("[CascadeView] Error:", err);
    } finally {
      setCascadeLoading(false);
    }
  }, []);

  // Determine whether enrichment jobs are active (for cascade view switching)
  // Computed inline so it doesn't depend on allJobs which is defined later
  const hasActiveJobs = useMemo(() => {
    return (
      realtimeJobs.running.length > 0 ||
      realtimeJobs.queued.length > 0 ||
      realtimeJobs.pending.length > 0 ||
      realtimeJobs.completed_with_errors.length > 0 ||
      realtimeJobs.failed.length > 0 ||
      realtimeJobs.completed.length > 0
    );
  }, [realtimeJobs]);

  // Fetch cascade products when jobs are empty
  useEffect(() => {
    if (!hasActiveJobs && !cascadeFetchedRef.current) {
      cascadeFetchedRef.current = true;
      void fetchCascadeProducts();
    }
    if (hasActiveJobs) {
      cascadeFetchedRef.current = false;
      setExtractingProducts([]);
      setSelectedCascadeUpc(null);
    }
  }, [hasActiveJobs, fetchCascadeProducts]);

  const handleCascadeRetry = async (upc: string) => {
    try {
      const res = await adminFetch("/api/admin/enrichment/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upcs: [upc], retryMode: "failed_or_untried" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to retry");
      }
      toast.success(`Re-extraction queued for UPC ${upc}`);
      void fetchCascadeProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to retry extraction");
    }
  };

  const handleCascadeResetToImported = async (upc: string) => {
    try {
      const res = await adminFetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upcs: [upc], toStatus: "imported" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to reset");
      }
      toast.success(`UPC ${upc} returned to Imported`);
      void fetchCascadeProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset product");
    }
  };

  const handleCancelJob = async (jobId: string) => {
    await resolveJob({
      jobId,
      confirmMessage: "Are you sure you want to cancel this enrichment run?",
      successMessage: "Enrichment run cancelled successfully",
      errorMessage: "Failed to cancel enrichment run",
    });
  };

  const handleRecoverJob = async (jobId: string) => {
    await resolveJob({
      jobId,
      confirmMessage:
        "Recover this stalled extraction job? Remaining attempts will be cancelled and stranded products will be returned to Imported when possible.",
      successMessage: "Stalled extraction job recovered",
      errorMessage: "Failed to recover stalled extraction job",
    });
  };

  const allJobs = useMemo(() => {
    const combined = [
      ...realtimeJobs.running,
      ...realtimeJobs.queued,
      ...realtimeJobs.pending,
      ...realtimeJobs.completed_with_errors,
      ...realtimeJobs.failed,
      ...realtimeJobs.completed,
      ...realtimeJobs.cancelled,
    ];

    const seen = new Set<string>();
    return combined
      .filter((job) => {
        if (seen.has(job.id)) return false;
        seen.add(job.id);
        return true;
      })
      .sort(compareMonitoringJobs);
  }, [realtimeJobs]);

  const selectedJob = useMemo(
    () => allJobs.find((job) => job.id === selectedJobId) || null,
    [allJobs, selectedJobId],
  );

  const handleSelectJob = useCallback(
    (jobId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("jobId", jobId);
      params.delete("attemptId");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {jobsError && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-rose-500/25 bg-rose-500/[0.02] p-3 text-xs text-rose-500">
          <AlertCircle className="size-4 shrink-0" />
          <span>Realtime connection failure: {jobsError.message}. Retrying…</span>
        </div>
      )}

      <div className="mt-4 flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
        {allJobs.length === 0 ? (
        cascadeLoading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : extractingProducts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-4xl mb-3">🔄</div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Extraction via Source Cascade</h3>
            <p className="text-xs text-gray-500 max-w-md">
              Products are now extracted through the automated source cascade. Active extraction runs are tracked per-source, not as batch jobs.
            </p>
            <p className="text-xs text-gray-400 mt-2 max-w-md">
              Products in <strong>Extracting</strong> status are being processed by the scraper runner. Check the <strong>Processed</strong> tab for results when extraction completes.
            </p>
            <p className="text-xs text-gray-400 mt-1 max-w-md">
              No products currently in Extracting status.
            </p>
          </div>
        ) : (
          <>
            <div className="w-[360px] min-w-[320px] max-w-[420px] border-r border-border">
              <CascadeProductSidebar
                products={extractingProducts}
                selectedUpc={selectedCascadeUpc}
                onSelectUpc={setSelectedCascadeUpc}
                onRefresh={fetchCascadeProducts}
              />
            </div>
            <div className="min-w-0 flex-1">
              <CascadeProductDetail
                upc={selectedCascadeUpc}
                products={extractingProducts}
                onRetry={handleCascadeRetry}
                onReset={handleCascadeResetToImported}
              />
            </div>
          </>
        )
      ) : (
          <>
            <div className="w-[360px] min-w-[320px] max-w-[420px] border-r border-border">
              <ExtractingSidebarList
                jobs={allJobs}
                selectedJobId={selectedJobId}
                onSelectJob={handleSelectJob}
              />
            </div>
            <div className="min-w-0 flex-1">
              <ExtractingDetailPane
                job={selectedJob}
                attempts={selectedJobAttempts}
            attemptsConnected={isAttemptsConnected}
            attemptsError={attemptsError}
            onCancelJob={handleCancelJob}
            onRecoverJob={handleRecoverJob}
            isCancelling={cancellingJobId === selectedJobId}
          />
        </div>
          </>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// Cascade Product Sidebar (shown when no enrichment jobs exist)
// =========================================================================

interface CascadeProductSidebarProps {
  products: CascadeProductProgress[];
  selectedUpc: string | null;
  onSelectUpc: (upc: string | null) => void;
  onRefresh: () => void;
}

function CascadeProductSidebar({
  products,
  selectedUpc,
  onSelectUpc,
  onRefresh,
}: CascadeProductSidebarProps) {
  return (
    <ScrollArea className="h-full">
      <div className="border-b border-border bg-muted/20 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Source Cascade
            </div>
            <h3 className="mt-1 text-base font-semibold text-foreground">Extracting products</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {products.length} product{products.length !== 1 ? "s" : ""} in progress
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {products.map((product) => {
          const status = getCascadeProductStatus(product);
          const orphaned = isCascadeProductOrphaned(product);

          const statusMeta =
            status === "running"
              ? { dot: "bg-emerald-500", label: "Running", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" }
              : status === "completed"
                ? { dot: "bg-teal-500", label: "Done", badge: "border-teal-200 bg-teal-50 text-teal-700" }
                : status === "failed"
                  ? { dot: "bg-rose-500", label: "Failed", badge: "border-rose-200 bg-rose-50 text-rose-700" }
                  : { dot: "bg-zinc-400", label: "Queued", badge: "border-zinc-200 bg-zinc-50 text-zinc-700" };

          return (
            <button
              key={product.upc}
              type="button"
              onClick={() => onSelectUpc(product.upc)}
              className={cn(
                "w-full px-4 py-3 text-left transition-colors",
                selectedUpc === product.upc ? "bg-primary/5" : "hover:bg-muted/30",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", statusMeta.dot)} />
                    <span className="truncate text-sm font-semibold text-foreground">
                      {product.productName || "Unnamed product"}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    UPC: {product.upc}
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold",
                    statusMeta.badge,
                  )}
                >
                  {statusMeta.label}
                </span>
              </div>

               <div className="mt-2 text-[11px] text-muted-foreground">
                {getSourceProgressLabel(product)}
              </div>

              {product.sourceOutcomes && product.sourceOutcomes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {product.sourceOutcomes.map((so) => (
                    <span
                      key={so.source_slug}
                      title={`${so.source_slug}: ${so.outcome}${so.error_message ? ` - ${so.error_message}` : ''}`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.2 text-[8px] font-semibold border uppercase tracking-wider",
                        so.outcome === "found" && "border-teal-200 bg-teal-50/50 text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/20 dark:text-teal-300",
                        so.outcome === "not_stocked" && "border-zinc-200 bg-zinc-50/50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/20 dark:text-zinc-400",
                        so.outcome === "source_error" && "border-rose-200 bg-rose-50/50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300",
                        so.outcome === "skipped" && "border-amber-200 bg-amber-50/50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300",
                      )}
                    >
                      <span className={cn(
                        "h-1 w-1 rounded-full",
                        so.outcome === "found" && "bg-teal-500",
                        so.outcome === "not_stocked" && "bg-zinc-400",
                        so.outcome === "source_error" && "bg-rose-500",
                        so.outcome === "skipped" && "bg-amber-500",
                      )} />
                      {so.source_slug}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                {product.sourceCounts.found > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-teal-200 bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700">
                    {product.sourceCounts.found} found
                  </span>
                )}
                {product.sourceCounts.source_error > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-medium text-rose-700">
                    {product.sourceCounts.source_error} errored
                  </span>
                )}
                {orphaned && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                    Orphaned
                  </span>
                )}
                {product.runnerName && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 font-medium text-foreground">
                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                    {product.runnerName}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// =========================================================================
// Cascade Product Detail Pane
// =========================================================================

interface CascadeProductDetailProps {
  upc: string | null;
  products: CascadeProductProgress[];
  onRetry: (upc: string) => void;
  onReset: (upc: string) => void;
}

function CascadeProductDetail({
  upc,
  products,
  onRetry,
  onReset,
}: CascadeProductDetailProps) {
  const product = upc ? products.find((p) => p.upc === upc) : null;

  if (!product) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-12 text-center text-muted-foreground">
        <Activity className="mb-4 h-12 w-12 opacity-20" />
        <h3 className="text-lg font-semibold text-foreground">Select a product to inspect</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Choose a product from the cascade queue to review source outcomes and progress.
        </p>
      </div>
    );
  }

  const status = getCascadeProductStatus(product);
  const orphaned = isCascadeProductOrphaned(product);

  return (
    <ScrollArea className="h-full bg-muted/10">
      <div className="divide-y divide-border">
        <section className="px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Source Cascade — Product
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-medium",
                    status === "running" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    status === "completed" && "border-teal-200 bg-teal-50 text-teal-700",
                    status === "failed" && "border-rose-200 bg-rose-50 text-rose-700",
                    status === "queued" && "border-zinc-200 bg-zinc-50 text-zinc-700",
                  )}
                >
                  {status === "running"
                    ? "Running"
                    : status === "completed"
                      ? "Completed"
                      : status === "failed"
                        ? "Failed"
                        : "Queued"}
                </Badge>
              </div>

              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {product.productName || "Unnamed product"}
                </h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">UPC: {product.upc}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {orphaned && (
                  <Badge variant="outline" className="font-medium border-amber-200 bg-amber-50 text-amber-800">
                    Orphaned — no active runner
                  </Badge>
                )}
                {product.runnerName && (
                  <Badge variant="outline" className="font-medium">
                    Runner: {product.runnerName}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {orphaned && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRetry(product.upc)}
                    className="h-9 gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReset(product.upc)}
                    className="h-9 gap-2 border-rose-200 text-rose-700 hover:bg-rose-50"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Reset to Imported
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Source progress summary */}
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
              <div className="text-[11px] font-medium text-muted-foreground">Sources found</div>
              <div className="mt-1 text-lg font-bold text-emerald-600">{product.sourceCounts.found}</div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
              <div className="text-[11px] font-medium text-muted-foreground">Not stocked</div>
              <div className="mt-1 text-lg font-bold text-muted-foreground">{product.sourceCounts.not_stocked}</div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
              <div className="text-[11px] font-medium text-muted-foreground">Errored</div>
              <div className="mt-1 text-lg font-bold text-rose-600">{product.sourceCounts.source_error}</div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
              <div className="text-[11px] font-medium text-muted-foreground">Skipped</div>
              <div className="mt-1 text-lg font-bold text-muted-foreground">{product.sourceCounts.skipped}</div>
            </div>
          </div>
        </section>

        <section className="px-6 py-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Source Outcomes</h3>

          {product.sourceOutcomes.length === 0 ? (
            <div className="rounded-md border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
              No source outcomes recorded yet. Waiting for the scraper runner to complete extraction.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border/70 bg-card">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/20 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {product.sourceOutcomes.map((so) => (
                    <tr key={so.source_slug}>
                      <td className="px-4 py-3 font-medium text-foreground">{so.source_slug}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold",
                            so.outcome === "found" &&
                              "border-teal-200 bg-teal-50 text-teal-700",
                            so.outcome === "not_stocked" &&
                              "border-zinc-200 bg-zinc-50 text-zinc-600",
                            so.outcome === "source_error" &&
                              "border-rose-200 bg-rose-50 text-rose-700",
                            so.outcome === "skipped" &&
                              "border-amber-200 bg-amber-50 text-amber-800",
                          )}
                        >
                          {so.outcome}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[300px]">
                        {so.error_message || "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
