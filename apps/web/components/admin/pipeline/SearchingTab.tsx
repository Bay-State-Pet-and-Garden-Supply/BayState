"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, PackageSearch, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

interface SearchingTabProps {
  className?: string;
}

export function SearchingTab({ className }: SearchingTabProps) {
  const router = useRouter();
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-16", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (cohorts.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
        <Search className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-black uppercase tracking-tighter text-foreground">
          No recent URL discoveries
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Select products in the Imported tab and choose &ldquo;Discover Official Brand URLs&rdquo; to start.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/admin/pipeline?stage=imported")}
        >
          Go to Imported &rarr;
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black uppercase tracking-tighter text-foreground">
          Recent Brand URL Discoveries
        </h3>
        <Button variant="outline" size="sm" onClick={() => void fetchCohorts()}>
          <Loader2 className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="divide-y divide-border rounded-none border border-border">
        {cohorts.map((cohort) => {
          const remaining = cohort.product_count - cohort.skus_with_selection - cohort.skus_extracted;
          return (
            <div
              key={cohort.cohort_id}
              className="flex items-center gap-4 px-4 py-4"
            >
              <Search className="h-5 w-5 shrink-0 text-primary" />
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
                  ) : (
                    <span className="text-brand-forest-green">all reviewed</span>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-8"
                onClick={() =>
                  router.push(`/admin/pipeline?stage=url_review&cohort_id=${cohort.cohort_id}`)
                }
              >
                Open in URL Review
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
