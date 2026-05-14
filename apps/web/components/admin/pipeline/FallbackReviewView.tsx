"use client";

import { useMemo, useState, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { adminFetch } from "@/lib/admin/api-client";
import {
  ConfirmationDialog,
} from "@/components/admin/confirmation-dialog";

interface ScrapeQuality {
  verdict: "needs_fallback_review";
  missing_fields: string[];
  reason: string;
  source_scores: Record<string, number>;
  threshold_version: string;
}

interface FallbackReviewViewProps {
  products: PipelineProduct[];
  selectedSkus: Set<string>;
  onSelectSku: (
    sku: string,
    selected: boolean,
    index?: number,
    isShiftClick?: boolean,
    visibleProducts?: PipelineProduct[],
  ) => void;
  onSelectAll?: (skus: string[]) => void;
  onDeselectAll?: (skus: string[]) => void;
  onRefresh: (silent?: boolean) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
}

function getScrapeQuality(product: PipelineProduct): ScrapeQuality | null {
  const raw = (product as unknown as Record<string, unknown>).scrape_quality;
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  const verdict = q.result || q.verdict;
  if (verdict === "needs_fallback_review") {
    return {
      verdict: "needs_fallback_review",
      missing_fields: Array.isArray(q.missingFields || q.missing_fields)
        ? (q.missingFields || q.missing_fields) as string[]
        : [],
      reason: typeof q.reason === "string" ? q.reason : "Insufficient product identity data from static scrape",
      source_scores: (q.sourceScores || q.source_scores) && typeof (q.sourceScores || q.source_scores) === "object"
        ? (q.sourceScores || q.source_scores) as Record<string, number>
        : {},
      threshold_version: typeof q.threshold_version === "string" ? q.threshold_version : "1.0",
    };
  }
  return null;
}

function getAttempedSourceSlugs(product: PipelineProduct): string[] {
  const sources = product.sources ?? {};
  return Object.keys(sources)
    .filter((k) => !k.startsWith("_"))
    .slice(0, 10);
}

function getSourceSnippet(product: PipelineProduct, sourceKey: string): string {
  const src = product.sources?.[sourceKey];
  if (!src || typeof src !== "object") return "—";
  const s = src as Record<string, unknown>;
  const parts: string[] = [];
  if (s.title || s.name) parts.push(String(s.title ?? s.name ?? ""));
  if (s.brand) parts.push(String(s.brand));
  if (s.url) parts.push(String(s.url));
  return parts.join(" · ") || "No data";
}

export function FallbackReviewView({
  products,
  selectedSkus,
  onSelectSku,
  onSelectAll,
  onDeselectAll,
  onRefresh,
}: FallbackReviewViewProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"approve" | "results" | "return" | null>(null);
  const [redirectingSku, setRedirectingSku] = useState<string | null>(null);

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.sku.localeCompare(b.sku)),
    [products],
  );

  const handleBulkAction = useCallback(
    async (action: "approve_fallback" | "mark_results_anyway" | "return_to_import") => {
      const skus = Array.from(selectedSkus);
      if (skus.length === 0) return;

      setActionLoading(true);
      try {
        const res = await adminFetch("/api/admin/pipeline/fallback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            skus,
          }),
        });

        if (res.ok) {
          const label =
            action === "approve_fallback"
              ? "approved for fallback"
              : action === "mark_results_anyway"
                ? "marked as results"
                : "returned to import";
          toast.success(`${skus.length} product${skus.length > 1 ? "s" : ""} ${label}`);
          setConfirmAction(null);
          onRefresh(true);
        } else {
          const err = await res.json();
          toast.error(err.error || `Failed to ${action}`);
        }
      } catch {
        toast.error(`Failed to ${action}`);
      } finally {
        setActionLoading(false);
      }
    },
    [selectedSkus, onRefresh],
  );

  const handleViewProduct = (sku: string) => {
    setRedirectingSku(sku);
    onSelectSku(sku, true);
    setTimeout(() => setRedirectingSku(null), 500);
  };

  const allSelected = sortedProducts.length > 0 && sortedProducts.every((p) => selectedSkus.has(p.sku));
  const someSelected = sortedProducts.some((p) => selectedSkus.has(p.sku));

  return (
    <div className="flex flex-col h-full min-h-0 border border-border rounded-none bg-card">
      {/* Header */}
      <div className="border-b border-border p-3 flex items-center gap-3">
        <label className="flex shrink-0 items-center justify-center h-9 w-9 border border-border bg-card hover:bg-muted cursor-pointer transition-colors">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(checked) => {
              if (checked) {
                onSelectAll?.(sortedProducts.map((p) => p.sku));
              } else {
                onDeselectAll?.(sortedProducts.map((p) => p.sku));
              }
            }}
            className="h-4 w-4 rounded-none border-border accent-foreground"
          />
        </label>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            Fallback Review
          </h2>
          <p className="text-[10px] text-muted-foreground">
            {sortedProducts.length} product{sortedProducts.length !== 1 ? "s" : ""} need manual review before SERPER/AI extraction
          </p>
        </div>
        {selectedSkus.size > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setConfirmAction("return"); }}
              disabled={actionLoading}
              className="h-8 text-[10px] font-semibold border-border rounded-none"
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Return to Import ({selectedSkus.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setConfirmAction("results"); }}
              disabled={actionLoading}
              className="h-8 text-[10px] font-semibold border-border rounded-none text-blue-600"
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Mark as Results ({selectedSkus.size})
            </Button>
            <Button
              size="sm"
              onClick={() => { setConfirmAction("approve"); }}
              disabled={actionLoading}
              className="h-8 text-[10px] font-semibold bg-orange-600 hover:bg-orange-700 text-background rounded-none"
            >
              {actionLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Approve Fallback ({selectedSkus.size})
            </Button>
          </div>
        )}
      </div>

      {/* Product List */}
      <div className="flex-1 overflow-y-auto">
        {sortedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No products need fallback review</p>
            <p className="text-xs text-muted-foreground/60">All static scrape results passed quality checks</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedProducts.map((product) => {
              const quality = getScrapeQuality(product);
              const sourceSlugs = getAttempedSourceSlugs(product);
              const isSelected = selectedSkus.has(product.sku);
              const isRedirecting = redirectingSku === product.sku;

              return (
                <div
                  key={product.sku}
                  className={`p-4 transition-colors ${
                    isSelected ? "bg-accent/30" : "hover:bg-muted/30"
                  } ${isRedirecting ? "bg-accent/50" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <label className="flex shrink-0 items-center justify-center h-8 w-8 border border-border bg-card hover:bg-muted cursor-pointer transition-colors mt-0.5">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onSelectSku(product.sku, !!checked)}
                        className="h-4 w-4 rounded-none border-border accent-foreground"
                      />
                    </label>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground font-mono">
                          {product.sku}
                        </span>
                        <span className="text-sm text-foreground truncate">
                          {product.input?.name || product.consolidated?.name || "—"}
                        </span>
                      </div>

                      {quality && (
                        <div className="space-y-2">
                          {/* Quality Reason */}
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-muted-foreground">{quality.reason}</p>
                          </div>

                          {/* Missing Fields */}
                          {quality.missing_fields.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {quality.missing_fields.map((field) => (
                                <Badge
                                  key={field}
                                  variant="outline"
                                  className="text-[9px] font-semibold text-orange-600 border-orange-200 bg-orange-50 rounded-none"
                                >
                                  Missing: {field}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Attempted Sources */}
                          {sourceSlugs.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-semibold">Attempted sources:</span>{" "}
                              {sourceSlugs.length > 0 ? (
                                <div className="mt-1 space-y-1">
                                  {sourceSlugs.map((slug) => (
                                    <div key={slug} className="text-[10px] text-foreground/70 truncate">
                                      <span className="font-mono text-muted-foreground">{slug}:</span>{" "}
                                      {getSourceSnippet(product, slug)}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/50">No sources attempted</span>
                              )}
                            </div>
                          )}

                          {/* Budget Warning */}
                          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2 py-1.5">
                            <AlertCircle className="h-3 w-3 text-amber-600" />
                            <span className="text-[9px] font-semibold text-amber-700">
                              Fallback will use SERPER search credits and may incur LLM extraction costs
                            </span>
                          </div>
                        </div>
                      )}

                      {!quality && (
                        <p className="text-xs text-muted-foreground">
                          No quality assessment found. Product was routed to fallback review.
                        </p>
                      )}
                    </div>

                    {/* Quick Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewProduct(product.sku)}
                        className="h-7 text-[9px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        open={confirmAction === "approve"}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        onConfirm={() => handleBulkAction("approve_fallback")}
        title="Approve Fallback Extraction"
        description={`This will start SERPER URL discovery for ${selectedSkus.size} product${selectedSkus.size !== 1 ? "s" : ""}. This may incur API costs. Are you sure?`}
        confirmLabel="Approve & Start Fallback"
      />
      <ConfirmationDialog
        open={confirmAction === "results"}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        onConfirm={() => handleBulkAction("mark_results_anyway")}
        title="Mark as Results"
        description={`This will move ${selectedSkus.size} product${selectedSkus.size !== 1 ? "s" : ""} to Results without running fallback extraction. Static data will be used as-is.`}
        confirmLabel="Mark as Results"
      />
      <ConfirmationDialog
        open={confirmAction === "return"}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        onConfirm={() => handleBulkAction("return_to_import")}
        title="Return to Import"
        description={`This will move ${selectedSkus.size} product${selectedSkus.size !== 1 ? "s" : ""} back to Imported stage for re-processing.`}
        confirmLabel="Return to Import"
      />
    </div>
  );
}
