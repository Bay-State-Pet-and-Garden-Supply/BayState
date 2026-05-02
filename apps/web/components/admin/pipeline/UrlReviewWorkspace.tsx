"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, ChevronLeft, Globe, Loader2, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OfficialBrandReviewClient } from "./OfficialBrandReviewClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { CandidatesBySkuResponse } from "@/lib/official-brand-review-types";

interface CohortSummary {
  cohort_id: string;
  name: string | null;
  brand_name: string | null;
  product_count: number;
  skus_with_selection: number;
  skus_extracted: number;
}

interface UrlReviewCohortsResponse {
  cohorts: CohortSummary[];
}

export function UrlReviewWorkspace() {
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCohort, setOpenCohort] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<CandidatesBySkuResponse | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);

  const fetchCohorts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pipeline/official-brand/url-review-cohorts", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load cohorts");
      const data: UrlReviewCohortsResponse = await res.json();
      setCohorts(data.cohorts);
    } catch {
      setCohorts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCohorts();
  }, [fetchCohorts]);

  const openCohortReview = useCallback(async (cohortId: string) => {
    setOpenCohort(cohortId);
    setLoadingReview(true);
    setReviewData(null);
    try {
      const res = await fetch(
        `/api/admin/pipeline/official-brand/candidates?cohort_id=${encodeURIComponent(cohortId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to load candidates");
      const data: CandidatesBySkuResponse = await res.json();
      setReviewData(data);
    } catch {
      setReviewData(null);
    } finally {
      setLoadingReview(false);
    }
  }, []);

  const searchParams = useSearchParams();
  const autoOpened = useRef(false);

  useEffect(() => {
    if (autoOpened.current || cohorts.length === 0) return;
    const urlCohortId = searchParams.get("cohort_id");
    if (!urlCohortId) return;
    const match = cohorts.find((c) => c.cohort_id === urlCohortId);
    if (match) {
      autoOpened.current = true;
      void openCohortReview(match.cohort_id);
    }
  }, [cohorts, searchParams, openCohortReview]);

  const handleBack = useCallback(() => {
    setOpenCohort(null);
    setReviewData(null);
  }, []);

  const returnCohortToImport = useCallback(async (cohortId: string, e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    try {
      const res = await fetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort_id: cohortId, fromStatus: "url_review", toStatus: "imported" }),
      });
      if (res.ok) {
        toast.success("Cohort returned to Imported");
        await fetchCohorts();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to return cohort");
      }
    } catch {
      toast.error("Failed to return cohort");
    }
  }, [fetchCohorts]);

  const needsReviewCount = useMemo(
    () => cohorts.reduce((sum, c) => sum + (c.product_count - c.skus_with_selection - c.skus_extracted), 0),
    [cohorts],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (openCohort && reviewData) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="h-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Cohort List
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <OfficialBrandReviewClient initialData={reviewData} />
        </div>
      </div>
    );
  }

  if (loadingReview) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (cohorts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <PackageSearch className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-black uppercase tracking-tighter text-foreground">
          No Cohorts Awaiting Review
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Cohorts with Official Brand URL candidates ready for review will appear here after SERP discovery completes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-tighter text-foreground">
            {cohorts.length} Cohort{cohorts.length !== 1 ? "s" : ""} in Review
          </h3>
          <p className="text-sm text-muted-foreground">
            {needsReviewCount} product{needsReviewCount !== 1 ? "s" : ""} need URL selection
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchCohorts()}>
          <Loader2 className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="divide-y divide-border rounded-none border border-border">
        {cohorts.map((cohort) => {
          const remaining = cohort.product_count - cohort.skus_with_selection - cohort.skus_extracted;
          return (
            <div
              key={cohort.cohort_id}
              className="flex items-center gap-2 hover:bg-muted/30 transition-colors"
            >
              <button
                type="button"
                onClick={() => void openCohortReview(cohort.cohort_id)}
                className="flex flex-1 items-center gap-4 px-4 py-4 text-left min-w-0"
              >
                <Globe className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black uppercase tracking-tight text-foreground">
                      {cohort.name ?? `Batch ${cohort.cohort_id.slice(0, 8)}`}
                    </span>
                    {cohort.brand_name ? (
                      <Badge variant="outline" className="border-brand-forest-green bg-brand-forest-green/10 text-brand-forest-green">
                        {cohort.brand_name}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <span>{cohort.product_count} products</span>
                    <span>{cohort.skus_with_selection} selected</span>
                    <span>{cohort.skus_extracted} extracted</span>
                    {remaining > 0 ? (
                      <span className="text-amber-600">{remaining} need review</span>
                    ) : null}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => void returnCohortToImport(cohort.cohort_id, e)}
                className="h-7 mr-2 text-[10px] text-muted-foreground hover:text-destructive rounded-none shrink-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Return All to Import
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
