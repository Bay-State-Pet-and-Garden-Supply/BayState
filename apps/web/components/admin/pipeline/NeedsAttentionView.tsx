"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  AlertCircle,
  RotateCcw,
  ArrowLeft,
  Loader2,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminFetch } from "@/lib/admin/api-client";

interface NeedsAttentionProduct {
  upc: string;
  pipeline_status: string;
  input?: {
    name?: string | null;
    price?: number | null;
  } | null;
  brand_id?: string | null;
}

interface SourceErrorGroup {
  sourceSlug: string;
  errorMessages: string[];
  upcs: string[];
}

interface NeedsAttentionViewProps {
  onRefresh: () => void;
}

export function NeedsAttentionView({
  onRefresh,
}: NeedsAttentionViewProps) {
  const [products, setProducts] = useState<NeedsAttentionProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submittingUpcs, setSubmittingUpcs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [sourceErrorGroups, setSourceErrorGroups] = useState<SourceErrorGroup[]>([]);

  // Separate data fetching from state setting to avoid eslint cascade warning
  const fetchProducts = useCallback(async () => {
    setError(null);
    // Fetch products with needs_attention status
    const res = await adminFetch("/api/admin/pipeline?stage=needs_attention&limit=500", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch products");
    const data = await res.json();
    const fetchedProducts: NeedsAttentionProduct[] = data.products ?? [];

    // Fetch source error details
    let groups: SourceErrorGroup[] = [];
    if (fetchedProducts.length > 0) {
      const upcs = fetchedProducts.map((p) => p.upc);
      const sourceRes = await adminFetch("/api/admin/pipeline/source-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upcs, outcomes: ["source_error"] }),
      });
      if (sourceRes.ok) {
        const sourceData = await sourceRes.json();
        const attempts: Array<{
            source_slug: string;
            error_message?: string | null;
            upc: string;
          }> = sourceData.attempts ?? [];

          // Group by source_slug
          const groupMap = new Map<string, { errorMessages: Set<string>; upcs: Set<string> }>();
          for (const attempt of attempts) {
            if (!attempt.source_slug) continue;
            const group = groupMap.get(attempt.source_slug) ?? {
              errorMessages: new Set<string>(),
              upcs: new Set<string>(),
            };
            if (attempt.error_message) group.errorMessages.add(attempt.error_message);
            group.upcs.add(attempt.upc);
            groupMap.set(attempt.source_slug, group);
          }

          groups = Array.from(groupMap.entries()).map(
            ([sourceSlug, { errorMessages, upcs }]) => ({
              sourceSlug,
              errorMessages: Array.from(errorMessages),
              upcs: Array.from(upcs),
            }),
          );
        }
      }

    return { fetchedProducts, groups };
  }, []);

  // Fetch on mount — state setting happens inside async function body
  useEffect(() => {
    let cancelled = false;
    const doFetch = async () => {
      try {
        const result = await fetchProducts();
        if (cancelled) return;
        setProducts(result.fetchedProducts);
        setSourceErrorGroups(result.groups);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load products");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    doFetch();
    return () => { cancelled = true; };
  }, [fetchProducts]);

  const handleRetryUpcs = async (upcs: string[]) => {
    if (upcs.length === 0) return;
    setSubmittingUpcs((prev) => {
      const next = new Set(prev);
      upcs.forEach((u) => next.add(u));
      return next;
    });

    try {
      const res = await adminFetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcs,
          toStatus: "extracting",
          resetResults: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to retry extraction");
      }

      toast.success(`Re-extraction started for ${upcs.length} products`, {
        description: "Only failed/untried sources will be retried.",
      });
      await fetchProducts();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to retry extraction");
    } finally {
      setSubmittingUpcs(new Set());
    }
  };

  const handleReturnToImported = async (upcs: string[]) => {
    if (upcs.length === 0) return;
    setSubmittingUpcs((prev) => {
      const next = new Set(prev);
      upcs.forEach((u) => next.add(u));
      return next;
    });

    try {
      const res = await adminFetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcs,
          toStatus: "imported",
          resetResults: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to reset products");
      }

      toast.success(`${upcs.length} product${upcs.length === 1 ? "" : "s"} returned to Imported`);
      const result = await fetchProducts();
      setProducts(result.fetchedProducts);
      setSourceErrorGroups(result.groups);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset products");
    } finally {
      setSubmittingUpcs(new Set());
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm font-semibold text-foreground">Failed to load</p>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchProducts} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-12 text-center text-muted-foreground">
        <Package className="h-12 w-12 mb-2 opacity-20" />
        <h3 className="text-sm font-semibold text-foreground">No products need attention</h3>
        <p className="text-xs mt-1">Products with source errors during extraction appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <div className="bg-card border-b border-border p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <h2 className="text-base font-semibold text-foreground">
              {products.length} Product{products.length !== 1 ? "s" : ""} Need Attention
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProducts}
            className="h-8 border border-border"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          These products had source errors during extraction. Review the errors below and retry
          failed sources or return products to Imported.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Group by source error type */}
        {sourceErrorGroups.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Errors by Source
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {sourceErrorGroups.map((group) => (
                <div
                  key={group.sourceSlug}
                  className="border border-border bg-card overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedSource(
                        expandedSource === group.sourceSlug ? null : group.sourceSlug,
                      )
                    }
                    className="flex items-center justify-between w-full p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                      <div className="text-left">
                        <span className="text-sm font-bold text-foreground">
                          {group.sourceSlug}
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          {group.upcs.length} product{group.upcs.length !== 1 ? "s" : ""} affected
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        expandedSource === group.sourceSlug ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {expandedSource === group.sourceSlug && (
                    <div className="border-t border-border p-3 space-y-3">
                      {group.errorMessages.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            Errors
                          </span>
                          {group.errorMessages.map((msg, i) => (
                            <div
                              key={i}
                              className="text-[10px] text-destructive font-medium bg-destructive/5 p-2 border border-destructive/20"
                            >
                              {msg}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                          Affected UPCs
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {group.upcs.slice(0, 10).map((upc) => (
                            <Badge
                              key={upc}
                              variant="outline"
                              className="text-[9px] font-mono bg-muted/30"
                            >
                              {upc}
                            </Badge>
                          ))}
                          {group.upcs.length > 10 && (
                            <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground">
                              +{group.upcs.length - 10} more
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="h-7 text-[10px] font-bold border border-border"
                          onClick={() => handleRetryUpcs(group.upcs)}
                          disabled={submittingUpcs.size > 0}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Retry Failed Sources
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] font-bold"
                          onClick={() => handleReturnToImported(group.upcs)}
                          disabled={submittingUpcs.size > 0}
                        >
                          <ArrowLeft className="h-3 w-3 mr-1" />
                          Return to Imported
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flat product list */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            All Products Needing Attention
          </h3>
          <div className="border border-border bg-card divide-y divide-border">
            {products.map((product) => (
              <div
                key={product.upc}
                className="flex items-center justify-between p-3 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground truncate">
                        {product.input?.name || "Untitled Product"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono bg-muted px-1 border border-border">
                        {product.upc}
                      </span>
                      {product.input?.price != null && (
                        <>
                          <span>•</span>
                          <span>${Number(product.input.price).toFixed(2)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    className="h-7 text-[10px] font-bold"
                    onClick={() => handleRetryUpcs([product.upc])}
                    disabled={submittingUpcs.has(product.upc)}
                  >
                    {submittingUpcs.has(product.upc) ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] font-bold"
                    onClick={() => handleReturnToImported([product.upc])}
                    disabled={submittingUpcs.has(product.upc)}
                  >
                    <ArrowLeft className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
