"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PackageSearch, Plus, Check, Send, XCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PipelineProduct } from "@/lib/pipeline/types";

interface EnrichmentTarget {
  id: string;
  sku: string;
  url: string;
  domain: string | null;
  status: "candidate" | "selected" | "rejected" | "processed" | "failed";
  selected: boolean;
  confidence: number | null;
  source: string;
  created_at: string;
  updated_at: string;
}

interface SkuReviewState {
  sku: string;
  productName: string | null;
  targets: EnrichmentTarget[];
  selectedTargetId: string | null;
  addingUrl: boolean;
}

export interface UrlReviewWorkspaceProps {
  products: PipelineProduct[];
  selectedSkus: Set<string>;
  onSelectSku: (sku: string, selected: boolean, index?: number, isShiftClick?: boolean, visibleProducts?: PipelineProduct[]) => void;
  onRefresh: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  filters: { source?: string; product_line?: string; cohort_id?: string };
  onFilterChange: (filters: { source?: string; product_line?: string; cohort_id?: string }) => void;
  availableSources: string[];
  groupedProducts: any;
  cohortBrands: any;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
}

export function UrlReviewWorkspace(props: UrlReviewWorkspaceProps) {
  const { products, selectedSkus, onSelectSku, onRefresh, search } = props;
  const [skuReviews, setSkuReviews] = useState<Map<string, SkuReviewState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingTargetId, setSavingTargetId] = useState<string | null>(null);
  const [sendingToEnrichment, setSendingToEnrichment] = useState(false);
  const [manualUrls, setManualUrls] = useState<Map<string, string>>(new Map());

  // Filter to url_review products
  const reviewProducts = useMemo(
    () => products.filter((p) => p.pipeline_status === "url_review"),
    [products],
  );

  // Load enrichment targets for products in url_review
  const loadTargets = useCallback(async () => {
    if (reviewProducts.length === 0) {
      setSkuReviews(new Map());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const skus = reviewProducts.map((p) => p.sku);
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const { data: targets, error } = await supabase
        .from("enrichment_targets")
        .select("*")
        .in("sku", skus)
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);

      const newMap = new Map<string, SkuReviewState>();
      for (const product of reviewProducts) {
        const productTargets = (targets as EnrichmentTarget[] || []).filter(
          (t) => t.sku === product.sku,
        );
        const selectedTarget = productTargets.find(
          (t) => t.selected && (t.status === "selected"),
        );

        newMap.set(product.sku, {
          sku: product.sku,
          productName: product.input?.name || null,
          targets: productTargets,
          selectedTargetId: selectedTarget?.id ?? null,
          addingUrl: false,
        });
      }
      setSkuReviews(newMap);
    } catch (err) {
      console.error("Failed to load enrichment targets:", err);
      const emptyMap = new Map<string, SkuReviewState>();
      for (const product of reviewProducts) {
        emptyMap.set(product.sku, {
          sku: product.sku,
          productName: product.input?.name || null,
          targets: [],
          selectedTargetId: null,
          addingUrl: false,
        });
      }
      setSkuReviews(emptyMap);
    } finally {
      setLoading(false);
    }
  }, [reviewProducts]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  // Select a target URL
  const handleSelectTarget = useCallback(
    async (sku: string, target: EnrichmentTarget) => {
      setSavingTargetId(target.id);
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        // Deselect all targets for this SKU
        const skuReview = skuReviews.get(sku);
        if (skuReview) {
          for (const t of skuReview.targets) {
            if (t.selected) {
              await supabase
                .from("enrichment_targets")
                .update({ selected: false, status: "candidate" })
                .eq("id", t.id);
            }
          }
        }

        // Select this target
        const { error } = await supabase
          .from("enrichment_targets")
          .update({ selected: true, status: "selected" })
          .eq("id", target.id);

        if (error) throw new Error(error.message);

        // Update local state
        const newMap = new Map(skuReviews);
        const review = newMap.get(sku);
        if (review) {
          review.targets = review.targets.map((t) => ({
            ...t,
            selected: t.id === target.id,
            status: t.id === target.id ? "selected" as const : (t.selected ? "candidate" as const : t.status),
          }));
          review.selectedTargetId = target.id;
          newMap.set(sku, review);
        }
        setSkuReviews(newMap);
        toast.success("URL selected");
      } catch (err) {
        toast.error("Failed to select URL");
        console.error(err);
      } finally {
        setSavingTargetId(null);
      }
    },
    [skuReviews],
  );

  // Reject a target URL
  const handleRejectTarget = useCallback(
    async (target: EnrichmentTarget) => {
      setSavingTargetId(target.id);
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        const { error } = await supabase
          .from("enrichment_targets")
          .update({ selected: false, status: "rejected" })
          .eq("id", target.id);

        if (error) throw new Error(error.message);

        // Update local state
        const newMap = new Map(skuReviews);
        const review = newMap.get(target.sku);
        if (review) {
          review.targets = review.targets.map((t) => ({
            ...t,
            selected: false,
            status: t.id === target.id ? "rejected" as const : t.status,
          }));
          if (review.selectedTargetId === target.id) {
            review.selectedTargetId = null;
          }
          newMap.set(target.sku, review);
        }
        setSkuReviews(newMap);
        toast.success("URL rejected");
      } catch (err) {
        toast.error("Failed to reject URL");
        console.error(err);
      } finally {
        setSavingTargetId(null);
      }
    },
    [skuReviews],
  );

  // Add a manual URL
  const handleAddManualUrl = useCallback(
    async (sku: string, url: string) => {
      if (!url.trim()) return;

      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      try {
        let domain: string | null = null;
        try {
          domain = new URL(url).hostname.replace("www.", "");
        } catch {
          // Invalid URL
        }

        const { data: newTarget, error } = await supabase
          .from("enrichment_targets")
          .insert({
            sku,
            url: url.trim(),
            domain,
            status: "selected",
            selected: true,
            source: "manual",
          })
          .select()
          .single();

        if (error) throw new Error(error.message);

        // Deselect existing targets
        const review = skuReviews.get(sku);
        if (review) {
          for (const t of review.targets) {
            if (t.selected) {
              await supabase
                .from("enrichment_targets")
                .update({ selected: false, status: "candidate" })
                .eq("id", t.id);
            }
          }
        }

        // Update local state
        const newMap = new Map(skuReviews);
        const updatedReview = newMap.get(sku);
        if (updatedReview) {
          updatedReview.targets = [
            ...updatedReview.targets.map((t) => ({
              ...t,
              selected: false,
              status: t.selected ? ("candidate" as const) : t.status,
            })),
            {
              id: newTarget.id,
              sku,
              url: url.trim(),
              domain,
              status: "selected" as const,
              selected: true,
              confidence: null,
              source: "manual",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
          updatedReview.selectedTargetId = newTarget.id;
          newMap.set(sku, updatedReview);
        }
        setSkuReviews(newMap);

        // Clear manual URL for this SKU
        const newManualUrls = new Map(manualUrls);
        newManualUrls.delete(sku);
        setManualUrls(newManualUrls);

        toast.success("URL added and selected");
      } catch (err) {
        toast.error("Failed to add URL");
        console.error(err);
      }
    },
    [skuReviews, manualUrls],
  );

  // Send selected SKUs to enrichment
  const handleSendToEnrichment = useCallback(async () => {
    const sendableSkus = reviewProducts
      .filter((p) => selectedSkus.has(p.sku))
      .filter((p) => {
        const review = skuReviews.get(p.sku);
        return review?.selectedTargetId;
      });

    if (sendableSkus.length === 0) {
      toast.error("No products with selected URLs ready for enrichment");
      return;
    }

    setSendingToEnrichment(true);
    try {
      const res = await fetch("/api/admin/enrichment/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skus: sendableSkus.map((p) => p.sku),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create enrichment job");
      }

      const data = await res.json();
      toast.success(
        `Created enrichment job for ${data.skuCount ?? sendableSkus.length} SKUs`,
      );
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send to enrichment");
    } finally {
      setSendingToEnrichment(false);
    }
  }, [reviewProducts, selectedSkus, skuReviews, onRefresh]);

  // Filter by search
  const filteredProducts = useMemo(() => {
    if (!search) return reviewProducts;
    const q = search.toLowerCase();
    return reviewProducts.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.input?.name?.toLowerCase().includes(q) ||
        p.input?.brand?.toLowerCase().includes(q),
    );
  }, [reviewProducts, search]);

  const skusNeedingAttention = useMemo(
    () =>
      filteredProducts.filter((p) => {
        const review = skuReviews.get(p.sku);
        return !review?.selectedTargetId;
      }).length,
    [filteredProducts, skuReviews],
  );

  const hasSelectedSkus = useMemo(
    () => selectedSkus.size > 0,
    [selectedSkus],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (filteredProducts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <PackageSearch className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground">
          No Products in URL Review
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Products that need a URL selected before enrichment will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {filteredProducts.length} Product{filteredProducts.length !== 1 ? "s" : ""} in URL Review
          </h3>
          <p className="text-sm text-muted-foreground">
            {skusNeedingAttention} product{skusNeedingAttention !== 1 ? "s" : ""} need URL selection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadTargets()}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSendToEnrichment()}
            disabled={!hasSelectedSkus || sendingToEnrichment}
          >
            {sendingToEnrichment ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send to Enrichment ({selectedSkus.size})
          </Button>
        </div>
      </div>

      {/* Product list with URLs */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredProducts.map((product) => {
          const review = skuReviews.get(product.sku);
          const isSelected = selectedSkus.has(product.sku);

          return (
            <div
              key={product.sku}
              className={cn(
                "rounded-none border transition-colors",
                isSelected
                  ? "border-primary bg-primary/[0.03]"
                  : "border-border hover:bg-muted/20",
              )}
            >
              {/* Product header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onSelectSku(product.sku, !selectedSkus.has(product.sku))}
                  className="h-4 w-4 shrink-0 rounded-sm border border-border"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {product.input?.name || `SKU: ${product.sku}`}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {product.sku}
                    </Badge>
                    {product.input?.brand ? (
                      <Badge variant="outline" className="text-[10px]">
                        {product.input.brand}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* URL candidates */}
              <div className="border-t border-border px-4 py-2">
                {review && review.targets.length > 0 ? (
                  <div className="space-y-1.5">
                    {review.targets.map((target) => {
                      const isSelectedUrl = target.id === review.selectedTargetId;
                      const isRejected = target.status === "rejected";

                      return (
                        <div
                          key={target.id}
                          className={cn(
                            "flex items-center gap-2 rounded-none border px-3 py-2 text-xs",
                            isSelectedUrl &&
                              "border-primary bg-primary/[0.03]",
                            isRejected &&
                              "border-border bg-muted/20 opacity-60",
                          )}
                        >
                          <a
                            href={target.url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 truncate font-mono text-[11px] text-primary underline-offset-4 hover:underline"
                          >
                            {target.url}
                          </a>
                          <div className="flex shrink-0 items-center gap-1">
                            {target.domain ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] bg-muted/30"
                              >
                                {target.domain}
                              </Badge>
                            ) : null}
                            {target.confidence !== null ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[9px]",
                                  target.confidence >= 0.8
                                    ? "text-brand-forest-green"
                                    : target.confidence >= 0.5
                                      ? "text-amber-600"
                                      : "text-muted-foreground",
                                )}
                              >
                                {(target.confidence * 100).toFixed(0)}%
                              </Badge>
                            ) : null}
                            <Badge
                              variant="outline"
                              className="text-[9px] text-muted-foreground"
                            >
                              {target.source}
                            </Badge>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {isRejected ? (
                              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                                Rejected
                              </Badge>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleSelectTarget(product.sku, target)
                                  }
                                  disabled={savingTargetId !== null || isSelectedUrl}
                                  className={cn(
                                    "flex items-center gap-1 rounded-none px-2 py-1 text-[10px] font-semibold transition-colors",
                                    isSelectedUrl
                                      ? "bg-primary/10 text-primary"
                                      : "text-muted-foreground hover:bg-primary/5 hover:text-primary",
                                  )}
                                >
                                  {savingTargetId === target.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                  {isSelectedUrl ? "Selected" : "Select"}
                                </button>
                                {!isSelectedUrl && !isRejected ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleRejectTarget(target)}
                                    disabled={savingTargetId !== null}
                                    className="flex items-center gap-1 rounded-none px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-destructive transition-colors"
                                  >
                                    <XCircle className="h-3 w-3" />
                                    Reject
                                  </button>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground py-1">
                    No URL candidates yet. Add a product page URL below to get enrichment started.
                  </p>
                )}

                {/* Manual URL input */}
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    value={manualUrls.get(product.sku) || ""}
                    onChange={(e) => {
                      const newMap = new Map(manualUrls);
                      if (e.target.value) {
                        newMap.set(product.sku, e.target.value);
                      } else {
                        newMap.delete(product.sku);
                      }
                      setManualUrls(newMap);
                    }}
                    placeholder="Paste a product page URL..."
                    className="h-7 flex-1 bg-background font-mono text-[11px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!manualUrls.get(product.sku)?.trim()}
                    onClick={() =>
                      void handleAddManualUrl(
                        product.sku,
                        manualUrls.get(product.sku) || "",
                      )
                    }
                    className="h-7 text-[10px]"
                  >
                    <Plus className="h-3 w-3" />
                    Add URL
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
