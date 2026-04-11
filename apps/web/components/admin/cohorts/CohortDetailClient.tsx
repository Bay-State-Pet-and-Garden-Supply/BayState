"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Tag,
  Loader2,
  AlertCircle,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Edit2,
  Check,
  X,
  Sparkles,
  BarChart3,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface BrandInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

interface CohortDetail {
  id: string;
  upc_prefix: string;
  product_line: string | null;
  status: string;
  scraper_config: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brands: BrandInfo | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

interface CohortMember {
  product_sku: string;
  upc_prefix: string;
  sort_order: number;
}

interface MemberProduct {
  sku: string;
  pipeline_status: string;
  input: {
    name?: string;
  } | null;
}

interface ScraperRecommendation {
  scraper_slug: string;
  scraper_name: string;
  hit_rate: number;
  total_attempts: number;
  successful_extractions: number;
  confidence: "high" | "medium" | "low" | "untested";
  reason: string;
  avg_fields_extracted: number;
  avg_images_found: number;
  preselected: boolean;
}

const STATUS_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  imported: { label: "Imported", className: "bg-gray-100 text-gray-800" },
  scraped: { label: "Scraped", className: "bg-blue-100 text-blue-800" },
  finalized: { label: "Finalized", className: "bg-amber-100 text-amber-800" },
};

const CONFIDENCE_CONFIG: Record<string, { label: string; className: string; barColor: string }> = {
  high: { label: "High", className: "bg-green-100 text-green-800", barColor: "bg-green-500" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-800", barColor: "bg-amber-500" },
  low: { label: "Low", className: "bg-red-100 text-red-800", barColor: "bg-red-400" },
  untested: { label: "Untested", className: "bg-gray-100 text-gray-600", barColor: "bg-gray-300" },
};

function HitRateBar({ rate }: { rate: number; }) {
  const pct = Math.round(rate * 100);
  const color = rate >= 0.6 ? "bg-green-500" : rate >= 0.4 ? "bg-amber-500" : "bg-red-400";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function CohortDetailClient({ cohortId }: { cohortId: string }) {
  const [cohort, setCohort] = useState<CohortDetail | null>(null);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [memberProducts, setMemberProducts] = useState<MemberProduct[]>([]);
  const [recommendations, setRecommendations] = useState<ScraperRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingBrand, setIsEditingBrand] = useState(false);
  const [brandInput, setBrandInput] = useState("");

  const fetchCohort = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/cohorts/${cohortId}`);
      if (!response.ok) throw new Error("Failed to fetch cohort");

      const data = await response.json();
      setCohort(data.cohort);
      setMembers(data.members || []);
      setMemberProducts(data.member_products || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  const fetchRecommendations = useCallback(async () => {
    setLoadingRecs(true);
    try {
      const response = await fetch(
        `/api/admin/cohorts/recommendations?cohort_id=${cohortId}`
      );
      if (response.ok) {
        const data = await response.json();
        setRecommendations(data.recommendations || []);
      }
    } catch {
      // Silently fail for recommendations
    } finally {
      setLoadingRecs(false);
    }
  }, [cohortId]);

  useEffect(() => {
    void fetchCohort();
  }, [fetchCohort]);

  useEffect(() => {
    if (cohort && (cohort.brand_name || cohort.brands?.name)) {
      void fetchRecommendations();
    }
  }, [cohort?.brand_name, cohort?.brands?.name, fetchRecommendations]);

  const handleAssignBrand = async () => {
    if (!brandInput.trim()) return;

    try {
      const response = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brandInput.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to assign brand");
      }

      toast.success(`Brand "${brandInput.trim()}" assigned`);
      setIsEditingBrand(false);
      setBrandInput("");
      await fetchCohort();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign brand");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !cohort) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900">Error Loading Cohort</h3>
            <p className="text-sm text-red-700 mt-1">{error || "Cohort not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  const brandName = cohort.brand_name || cohort.brands?.name || null;
  const statusBadge = STATUS_BADGE_CONFIG[cohort.status] || STATUS_BADGE_CONFIG.pending;

  // Pipeline status breakdown
  const statusCounts: Record<string, number> = {};
  memberProducts.forEach((p) => {
    statusCounts[p.pipeline_status] = (statusCounts[p.pipeline_status] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/cohorts/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {cohort.product_line || `Cohort ${cohort.id.slice(0, 8)}`}
              </h1>
              <Badge className={statusBadge.className}>
                {statusBadge.label}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              UPC Prefix: <code className="font-mono">{cohort.upc_prefix}</code> · {members.length} products
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void fetchCohort();
            void fetchRecommendations();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Brand + Members */}
        <div className="lg:col-span-2 space-y-6">
          {/* Brand Assignment Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Tag className="h-5 w-5" />
                Brand Assignment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditingBrand ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={brandInput}
                    onChange={(e) => setBrandInput(e.target.value)}
                    placeholder="Enter brand name (e.g., KONG, Blue Buffalo)"
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAssignBrand();
                      if (e.key === "Escape") setIsEditingBrand(false);
                    }}
                  />
                  <Button size="sm" onClick={() => void handleAssignBrand()} disabled={!brandInput.trim()}>
                    <Check className="mr-1 h-4 w-4" />
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingBrand(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : brandName ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-forest-green/10 p-2.5">
                      <Tag className="h-5 w-5 text-brand-forest-green" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{brandName}</p>
                      <p className="text-xs text-muted-foreground">
                        Scraper recommendations are active for this brand
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBrandInput(brandName);
                      setIsEditingBrand(true);
                    }}
                  >
                    <Edit2 className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Tag className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    Assign a brand to enable automatic scraper recommendations
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditingBrand(true)}
                  >
                    <Tag className="mr-2 h-4 w-4" />
                    Assign Brand
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5" />
                Pipeline Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(statusCounts).length > 0 ? (
                <div className="flex items-center gap-4 flex-wrap">
                  {Object.entries(statusCounts).map(([status, count]) => {
                    const badge = STATUS_BADGE_CONFIG[status] || STATUS_BADGE_CONFIG.pending;
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <Badge className={badge.className}>{badge.label}</Badge>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No member products tracked yet</p>
              )}
            </CardContent>
          </Card>

          {/* Member Products Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5" />
                Products ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No products in this cohort
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Pipeline Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => {
                      const product = memberProducts.find(
                        (p) => p.sku === member.product_sku
                      );
                      const inputData = product?.input as { name?: string } | null;
                      const badge = product
                        ? STATUS_BADGE_CONFIG[product.pipeline_status] || STATUS_BADGE_CONFIG.pending
                        : null;

                      return (
                        <TableRow key={member.product_sku}>
                          <TableCell className="font-mono text-sm">
                            {member.product_sku}
                          </TableCell>
                          <TableCell>
                            {inputData?.name || (
                              <span className="text-muted-foreground italic">
                                No name
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {badge ? (
                              <Badge className={`text-xs ${badge.className}`}>
                                {badge.label}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                Not tracked
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Recommendations */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5" />
                Scraper Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!brandName ? (
                <div className="text-center py-6">
                  <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Assign a brand to see scraper recommendations
                  </p>
                </div>
              ) : loadingRecs ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No scraper data available yet
                </p>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((rec) => {
                    const conf = CONFIDENCE_CONFIG[rec.confidence] || CONFIDENCE_CONFIG.untested;

                    return (
                      <div
                        key={rec.scraper_slug}
                        className={`rounded-lg border p-3 transition-colors ${
                          rec.preselected
                            ? "border-brand-forest-green/30 bg-brand-forest-green/5"
                            : "border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            {rec.preselected && (
                              <Zap className="h-3.5 w-3.5 text-brand-forest-green" />
                            )}
                            <span className="font-medium text-sm">
                              {rec.scraper_name}
                            </span>
                          </div>
                          <Badge className={`text-xs ${conf.className}`}>
                            {conf.label}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <HitRateBar rate={rec.hit_rate} />
                          <p className="text-xs text-muted-foreground">
                            {rec.reason}
                          </p>
                          {rec.total_attempts > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {rec.successful_extractions}/{rec.total_attempts} successful ·{" "}
                              {rec.avg_fields_extracted.toFixed(1)} avg fields ·{" "}
                              {rec.avg_images_found.toFixed(1)} avg images
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cohort Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <code className="font-mono text-xs">{cohort.id.slice(0, 12)}...</code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">UPC Prefix</span>
                <code className="font-mono">{cohort.upc_prefix}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(cohort.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>{new Date(cohort.updated_at).toLocaleDateString()}</span>
              </div>
              {cohort.scraper_config && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Config</span>
                  <span>{cohort.scraper_config}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
