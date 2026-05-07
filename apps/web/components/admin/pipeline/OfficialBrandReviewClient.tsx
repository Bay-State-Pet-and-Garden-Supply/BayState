"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, Circle, Keyboard, Loader2, PackageSearch, Play, RefreshCw } from "lucide-react";
import { CandidateUrlPicker } from "./CandidateUrlPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CandidatesBySkuResponse,
  OfficialBrandCandidateReviewItem,
  OfficialBrandSelectionStatus,
  OfficialBrandSkuReview,
} from "@/lib/official-brand-review-types";

interface OfficialBrandReviewClientProps {
  initialData: CandidatesBySkuResponse;
  discoveryJobId?: string | null;
  onBack?: () => void;
}

function summarizeSkus(skus: OfficialBrandSkuReview[]) {
  return {
    total_skus: skus.length,
    skus_with_selection: skus.filter((entry) =>
      entry.candidates.some((candidate) => candidate.selection_status === "selected"),
    ).length,
    skus_without_candidates: skus.filter((entry) => entry.candidate_count === 0)
      .length,
    skus_reviewed: skus.filter((entry) => entry.has_been_reviewed).length,
    skus_extracted: skus.filter((entry) =>
      entry.candidates.some((candidate) => candidate.selection_status === "extracted"),
    ).length,
  };
}

function deriveSkuReview(
  entry: OfficialBrandSkuReview,
  candidates: OfficialBrandCandidateReviewItem[],
): OfficialBrandSkuReview {
  return {
    ...entry,
    candidates,
    selected_url:
      candidates.find((candidate) => candidate.selection_status === "selected")?.url ??
      null,
    candidate_count: candidates.length,
    has_been_reviewed: candidates.some((candidate) => Boolean(candidate.reviewed_at)),
  };
}

function hasSelected(entry: OfficialBrandSkuReview): boolean {
  return entry.candidates.some((candidate) => candidate.selection_status === "selected");
}

function hasExtracted(entry: OfficialBrandSkuReview): boolean {
  return entry.candidates.some((candidate) => candidate.selection_status === "extracted");
}

function getInitialActiveSku(data: CandidatesBySkuResponse): string | null {
  return (
    data.skus.find((entry) => !hasSelected(entry) && !hasExtracted(entry))?.sku ??
    data.skus[0]?.sku ??
    null
  );
}

function getStatusLabel(entry: OfficialBrandSkuReview): {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
} {
  if (hasExtracted(entry)) {
    return {
      label: "Extracted",
      icon: CheckCircle2,
      className: "text-brand-forest-green",
    };
  }

  if (hasSelected(entry)) {
    return {
      label: "Selected",
      icon: CheckCircle2,
      className: "text-brand-forest-green",
    };
  }

  if (entry.candidate_count === 0) {
    return {
      label: "No Candidates",
      icon: AlertTriangle,
      className: "text-brand-burgundy",
    };
  }

  return {
    label: "Needs Review",
    icon: AlertTriangle,
    className: "text-amber-600",
  };
}

function getSelectableCandidates(entry: OfficialBrandSkuReview) {
  return entry.candidates.filter(
    (candidate) =>
      candidate.selection_status !== "rejected" &&
      candidate.selection_status !== "failed" &&
      candidate.selection_status !== "extracted",
  );
}

export function OfficialBrandReviewClient({
  initialData,
  discoveryJobId,
  onBack,
}: OfficialBrandReviewClientProps) {
  const [data, setData] = useState(initialData);
  const [activeSku, setActiveSku] = useState<string | null>(() =>
    getInitialActiveSku(initialData),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingExtraction, setIsStartingExtraction] = useState(false);
  const [pendingCandidateKey, setPendingCandidateKey] = useState<string | null>(null);

  const activeIndex = useMemo(
    () => data.skus.findIndex((entry) => entry.sku === activeSku),
    [activeSku, data.skus],
  );
  const activeEntry = activeIndex >= 0 ? data.skus[activeIndex] : null;
  const selectedSkus = useMemo(
    () => data.skus.filter(hasSelected).map((entry) => entry.sku),
    [data.skus],
  );
  const autoSelectionsToReview = useMemo(
    () =>
      data.skus.flatMap((entry) => {
        const selected = entry.candidates.find(
          (candidate) => candidate.selection_status === "selected",
        );
        return selected && !selected.reviewed_at
          ? [{ sku: entry.sku, normalized_url: selected.normalized_url }]
          : [];
      }),
    [data.skus],
  );

  const refreshData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsRefreshing(true);
      }

      try {
        const params = new URLSearchParams({ cohort_id: data.cohort.id });
        if (discoveryJobId) {
          params.set("discovery_job_id", discoveryJobId);
        }

        const response = await fetch(
          `/api/admin/pipeline/official-brand/candidates?${params.toString()}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Failed to refresh candidates");
        }

        const nextData = payload as CandidatesBySkuResponse;
        setData(nextData);
        setActiveSku((current) => {
          if (current && nextData.skus.some((entry) => entry.sku === current)) {
            return current;
          }
          return getInitialActiveSku(nextData);
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to refresh candidates",
        );
      } finally {
        if (!silent) {
          setIsRefreshing(false);
        }
      }
    },
    [data.cohort.id, discoveryJobId],
  );

  const optimisticallyUpdateCandidate = useCallback(
    (
      sku: string,
      normalizedUrl: string,
      selectionStatus: OfficialBrandSelectionStatus,
    ) => {
      const nowIso = new Date().toISOString();
      setData((current) => {
        const skus = current.skus.map((entry) => {
          if (entry.sku !== sku) {
            return entry;
          }

          const candidates = entry.candidates.map((candidate) => {
            if (
              selectionStatus === "selected" &&
              candidate.selection_status === "selected" &&
              candidate.normalized_url !== normalizedUrl
            ) {
              return { ...candidate, selection_status: "candidate" as const };
            }

            if (candidate.normalized_url !== normalizedUrl) {
              return candidate;
            }

            return {
              ...candidate,
              selection_status: selectionStatus,
              reviewed_at: candidate.reviewed_at ?? nowIso,
            };
          });

          return deriveSkuReview(entry, candidates);
        });

        return { ...current, skus, summary: summarizeSkus(skus) };
      });
    },
    [],
  );

  const updateCandidateStatus = useCallback(
    async (
      sku: string,
      normalizedUrl: string,
      selectionStatus: OfficialBrandSelectionStatus,
    ) => {
      const pendingKey = `${sku}:${normalizedUrl}`;
      setIsSaving(true);
      setPendingCandidateKey(pendingKey);
      optimisticallyUpdateCandidate(sku, normalizedUrl, selectionStatus);

      try {
        const response = await fetch("/api/admin/pipeline/official-brand/candidates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updates: [
              {
                sku,
                normalized_url: normalizedUrl,
                selection_status: selectionStatus,
              },
            ],
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Failed to update candidate");
        }

        await refreshData(true);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update candidate",
        );
        await refreshData(true);
      } finally {
        setPendingCandidateKey(null);
        setIsSaving(false);
      }
    },
    [optimisticallyUpdateCandidate, refreshData],
  );

  const handleAcceptAutoSelections = async () => {
    if (autoSelectionsToReview.length === 0) {
      toast.info("No auto-selections need review");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/pipeline/official-brand/candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: autoSelectionsToReview.map((update) => ({
            ...update,
            selection_status: "selected",
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to accept auto-selections");
      }

      toast.success(`Marked ${autoSelectionsToReview.length} selection${autoSelectionsToReview.length === 1 ? "" : "s"} reviewed`);
      await refreshData(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to accept auto-selections",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartExtraction = async () => {
    if (selectedSkus.length === 0) {
      toast.error("Select at least one URL before extraction");
      return;
    }

    setIsStartingExtraction(true);
    try {
      const response = await fetch("/api/admin/pipeline/official-brand/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort_id: data.cohort.id, skus: selectedSkus }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to start extraction");
      }

      toast.success(`Started extraction for ${selectedSkus.length} SKU${selectedSkus.length === 1 ? "" : "s"}`, {
        description: `Job ID: ${payload.jobIds?.[0]?.slice(0, 8) ?? "unknown"}...`,
      });
      await refreshData(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start extraction");
    } finally {
      setIsStartingExtraction(false);
    }
  };

  const handleReturnCohortToImport = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort_id: data.cohort.id, fromStatus: "url_review", toStatus: "imported", resetResults: true }),
      });
      if (res.ok) {
        toast.success("Cohort returned to Imported");
        await refreshData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to return cohort");
      }
    } catch {
      toast.error("Failed to return cohort");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddManualUrl = async (url: string): Promise<boolean> => {
    if (!activeEntry) {
      return false;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/pipeline/official-brand/add-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: activeEntry.sku,
          url,
          cohort_id: data.cohort.id,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to add URL");
      }

      toast.success("Manual URL added and selected");
      await refreshData(true);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add URL");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (data.skus.length === 0) {
          return;
        }
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const currentIndex = activeIndex >= 0 ? activeIndex : 0;
        const nextIndex =
          (currentIndex + direction + data.skus.length) % data.skus.length;
        setActiveSku(data.skus[nextIndex].sku);
        return;
      }

      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && activeEntry) {
        const candidates = getSelectableCandidates(activeEntry);
        if (candidates.length === 0 || isSaving) {
          return;
        }

        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const currentIndex = candidates.findIndex(
          (candidate) => candidate.selection_status === "selected",
        );
        const fallbackIndex = direction === 1 ? -1 : 0;
        const nextIndex =
          ((currentIndex === -1 ? fallbackIndex : currentIndex) +
            direction +
            candidates.length) %
          candidates.length;
        const nextCandidate = candidates[nextIndex];
        void updateCandidateStatus(
          activeEntry.sku,
          nextCandidate.normalized_url,
          "selected",
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeEntry, activeIndex, data.skus, isSaving, updateCandidateStatus]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 rounded-none border border-border bg-card p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {onBack ? (
                <Button variant="outline" size="icon" onClick={onBack} className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              ) : null}
              <Badge variant="outline" className="bg-primary/5 text-primary">
                Cohort
              </Badge>
              <h2 className="text-xl font-semibold text-foreground">
                {data.cohort.name ?? `Batch ${data.cohort.id.slice(0, 8)}`}
              </h2>
              <span className="text-sm font-bold text-muted-foreground">
                Brand: {data.cohort.brand_name}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="shrink-0 font-semibold text-foreground">
                  Domains:
                </span>
                <span className="font-mono line-clamp-2 break-all">
                  {[...data.cohort.official_domains, ...data.cohort.preferred_domains].length > 0
                    ? [...data.cohort.official_domains, ...data.cohort.preferred_domains].join(", ")
                    : "No configured domains"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-l border-border pl-3 text-[10px] font-semibold">
                <Keyboard className="h-3.5 w-3.5" />
                <span>Up/Down: SKU • Left/Right: URL</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshData()}
              disabled={isRefreshing || isSaving || isStartingExtraction}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleAcceptAutoSelections()}
              disabled={isSaving || autoSelectionsToReview.length === 0}
            >
              Accept Auto-Selections ({autoSelectionsToReview.length})
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleStartExtraction()}
              disabled={
                isStartingExtraction || isSaving || selectedSkus.length === 0
              }
            >
              {isStartingExtraction ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start Extraction ({selectedSkus.length})
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleReturnCohortToImport()}
              disabled={isSaving || isStartingExtraction}
              className="text-muted-foreground hover:text-destructive"
            >
              <ChevronLeft className="h-4 w-4" />
              Return Cohort to Import
            </Button>
          </div>
        </div>

      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-none border border-border bg-card">
          <div className="shrink-0 border-b border-border p-3">
            <h3 className="text-xs font-semibold text-foreground">
              Product Master List
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.skus.length} SKU{data.skus.length === 1 ? "" : "s"} in this cohort
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {data.skus.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No products found for this cohort.
              </div>
            ) : (
              data.skus.map((entry) => {
                const status = getStatusLabel(entry);
                const StatusIcon = status.icon;
                const isActive = entry.sku === activeSku;
                return (
                  <button
                    key={entry.sku}
                    ref={isActive ? (el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" }) : undefined}
                    type="button"
                    onClick={() => setActiveSku(entry.sku)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0",
                      isActive ? "bg-primary/5" : "hover:bg-muted/30",
                    )}
                  >
                    <StatusIcon className={cn("mt-0.5 h-4 w-4 shrink-0", status.className)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {entry.sku}
                        </span>
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-foreground">
                        {entry.product_name ?? "Unnamed product"}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
                        {entry.candidate_count} candidate{entry.candidate_count === 1 ? "" : "s"}
                      </p>
                    </div>
                    {isActive ? (
                      <Circle className="mt-1 h-2.5 w-2.5 fill-primary text-primary" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="min-h-0 overflow-hidden rounded-none border border-border bg-card">
          {activeEntry ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="bg-muted/20 font-mono">
                        {activeEntry.sku}
                      </Badge>
                      {hasSelected(activeEntry) ? <Badge variant="success">URL Selected</Badge> : null}
                      {hasExtracted(activeEntry) ? <Badge variant="success">Extracted</Badge> : null}
                      {!hasSelected(activeEntry) && !hasExtracted(activeEntry) ? (
                        <Badge variant="warning">Needs Review</Badge>
                      ) : null}
                    </div>
                    <h3 className="mt-3 text-xl font-bold tracking-tight text-foreground">
                      {activeEntry.product_name ?? "Unnamed product"}
                    </h3>
                    {activeEntry.predicted_name ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Predicted: {activeEntry.predicted_name}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 p-4">
                <CandidateUrlPicker
                  skuReview={activeEntry}
                  officialDomains={data.cohort.official_domains}
                  preferredDomains={data.cohort.preferred_domains}
                  isSaving={isSaving}
                  pendingCandidateKey={pendingCandidateKey}
                  onSelectCandidate={(candidate) => {
                    void updateCandidateStatus(
                      activeEntry.sku,
                      candidate.normalized_url,
                      "selected",
                    );
                  }}
                  onRejectCandidate={(candidate) => {
                    void updateCandidateStatus(
                      activeEntry.sku,
                      candidate.normalized_url,
                      "rejected",
                    );
                  }}
                  onAddManualUrl={handleAddManualUrl}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div>
                <PackageSearch className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="mt-3 text-lg font-semibold text-foreground">
                  No Active SKU
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a product from the master list to review URL candidates.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
