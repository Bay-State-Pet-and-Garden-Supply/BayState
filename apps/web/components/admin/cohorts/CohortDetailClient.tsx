"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Tag,
  Loader2,
  AlertCircle,
  Package,
  Sparkles,
  BarChart3,
  RefreshCw,
  Zap,
  Globe,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { CohortBrandPicker } from "./CohortBrandPicker";
import type { CohortBrandInfo } from "./types";
import { isConfiguredBrand } from "./types";
import { BrandModal } from "@/components/admin/brands/BrandModal";

interface CohortDetail {
  id: string;
  upc_prefix: string;
  product_line: string | null;
  status: string;
  scraper_config: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brands: CohortBrandInfo | null;
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
  pending: { label: "Pending", className: "bg-zinc-100 text-zinc-950 border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-950 border-blue-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]" },
  completed: { label: "Completed", className: "bg-brand-forest-green text-white border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]" },
  failed: { label: "Failed", className: "bg-brand-burgundy text-white border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]" },
  imported: { label: "Imported", className: "bg-zinc-100 text-zinc-950 border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]" },
  scraped: { label: "Scraped", className: "bg-blue-100 text-blue-950 border-blue-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]" },
  finalized: { label: "Finalized", className: "bg-brand-gold text-brand-burgundy border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]" },
};

const CONFIDENCE_CONFIG: Record<string, { label: string; className: string; barColor: string }> = {
  high: { label: "High", className: "bg-brand-forest-green text-white border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]", barColor: "bg-brand-forest-green" },
  medium: { label: "Medium", className: "bg-brand-gold text-brand-burgundy border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]", barColor: "bg-brand-gold" },
  low: { label: "Low", className: "bg-brand-burgundy text-white border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]", barColor: "bg-brand-burgundy" },
  untested: { label: "Untested", className: "bg-zinc-100 text-zinc-500 border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]", barColor: "bg-zinc-300" },
};

function HitRateBar({ rate }: { rate: number; }) {
  const pct = Math.round(rate * 100);
  const color = rate >= 0.6 ? "bg-brand-forest-green" : rate >= 0.4 ? "bg-brand-gold" : "bg-brand-burgundy";

  return (
    <div className="flex items-center gap-2">
      <div className="h-3 w-20 rounded-none bg-zinc-100 border border-zinc-950 overflow-hidden shadow-[1px_1px_0px_rgba(0,0,0,1)]">
        <div
          className={`h-full rounded-none transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-black text-zinc-950">{pct}%</span>
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
  const [editingBrand, setEditingBrand] = useState<CohortBrandInfo | null>(null);

  const fetchCohort = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/cohorts/${cohortId}?include_members=true`);
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
  }, [cohort, fetchRecommendations]);

  const handleAssignBrand = async (brand: CohortBrandInfo | null) => {
    try {
      const response = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          brand
            ? { brand_id: brand.id, brand_name: null }
            : { brand_id: null, brand_name: null }
        ),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to assign brand");
      }

      if (brand) {
        toast.success(`Brand "${brand.name}" assigned`, {
          description: isConfiguredBrand(brand)
            ? "Scraper recommendations are active for this cohort."
            : "Brand linked. Add official site/domain details to strengthen AI Search guidance.",
        });
      } else {
        toast.success("Brand assignment cleared");
      }

      await fetchCohort();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign brand");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand-forest-green" />
      </div>
    );
  }

  if (error || !cohort) {
    return (
      <div className="rounded-none border border-zinc-950 bg-brand-burgundy/10 p-4 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-brand-burgundy shrink-0" />
          <div>
            <h3 className="font-black uppercase tracking-tight text-brand-burgundy">Error Loading Cohort</h3>
            <p className="text-sm font-bold text-brand-burgundy/80 mt-1">{error || "Cohort not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  const brandName = cohort.brand_name || cohort.brands?.name || null;
  const brand = cohort.brands;
  const configuredBrand = isConfiguredBrand(brand);
  const statusBadge = STATUS_BADGE_CONFIG[cohort.status] || STATUS_BADGE_CONFIG.pending;

  // Pipeline status breakdown
  const statusCounts: Record<string, number> = {};
  memberProducts.forEach((p) => {
    statusCounts[p.pipeline_status] = (statusCounts[p.pipeline_status] || 0) + 1;
  });

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="sm" asChild className="rounded-none border border-zinc-950 hover:bg-zinc-100 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <Link href="/admin/cohorts/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black uppercase tracking-tighter text-zinc-950">
                {cohort.product_line || `Cohort ${cohort.id.slice(0, 8)}`}
              </h1>
              <Badge className={`rounded-none border border-zinc-950 font-black uppercase text-[10px] ${statusBadge.className}`}>
                {statusBadge.label}
              </Badge>
            </div>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-600">
              UPC Prefix: <code className="font-mono bg-zinc-950 text-white px-1 py-0.5">{cohort.upc_prefix}</code> · {members.length} products
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
          onClick={() => {
            void fetchCohort();
            void fetchRecommendations();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* Left column: Brand + Members */}
        <div className="flex-1 flex flex-col space-y-6 min-h-0">
          {/* Brand Assignment Card */}
          <Card className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <CardHeader className="bg-zinc-50 border-b border-zinc-950">
              <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-zinc-950">
                <Tag className="h-5 w-5" />
                Brand Assignment
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <CohortBrandPicker
                  value={brand}
                  onAssign={handleAssignBrand}
                  triggerClassName="w-full justify-between px-3 py-5"
                  emptyLabel="Assign Brand"
                />
                {brandName ? (
                  <div className="rounded-none border border-zinc-950 bg-zinc-50 p-4 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <p className="font-black uppercase text-zinc-950 tracking-tight">{brandName}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                          {configuredBrand
                            ? 'Scraper recommendations are active for this brand'
                            : 'Brand linked, but official site/domain guidance is still missing'}
                        </p>
                      </div>
                      {brand && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] font-black uppercase"
                          onClick={() => setEditingBrand(brand)}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit Brand Details
                        </Button>
                      )}
                    </div>
                    {brand && (
                      <div className="mt-4 grid gap-2 text-[10px] font-black uppercase tracking-wide text-zinc-600 sm:grid-cols-3">
                        <div className="rounded-none border border-zinc-200 bg-white px-3 py-2">
                          <span className="block text-zinc-500">Official Site</span>
                          {brand.website_url ? (
                            <a href={brand.website_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-brand-forest-green hover:underline">
                              <Globe className="h-3 w-3" />
                              View Site
                            </a>
                          ) : (
                            <span className="mt-1 block text-brand-burgundy">Missing</span>
                          )}
                        </div>
                        <div className="rounded-none border border-zinc-200 bg-white px-3 py-2">
                          <span className="block text-zinc-500">Official Domains</span>
                          <span className="mt-1 block text-zinc-950">{brand.official_domains.length}</span>
                        </div>
                        <div className="rounded-none border border-zinc-200 bg-white px-3 py-2">
                          <span className="block text-zinc-500">Preferred Domains</span>
                          <span className="mt-1 block text-zinc-950">{brand.preferred_domains.length}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Tag className="h-8 w-8 text-zinc-300 mx-auto mb-3" />
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-4">
                      Assign a brand to enable automatic scraper recommendations
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pipeline Status Breakdown */}
          <Card className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <CardHeader className="bg-zinc-50 border-b border-zinc-950">
              <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-zinc-950">
                <BarChart3 className="h-5 w-5" />
                Pipeline Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {Object.keys(statusCounts).length > 0 ? (
                <div className="flex items-center gap-4 flex-wrap">
                  {Object.entries(statusCounts).map(([status, count]) => {
                    const badge = STATUS_BADGE_CONFIG[status] || STATUS_BADGE_CONFIG.pending;
                    return (
                      <div key={status} className="flex items-center gap-2 bg-zinc-100 border border-zinc-950 px-2 py-1 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                        <Badge className={`rounded-none border border-zinc-950 font-black uppercase text-[10px] ${badge.className}`}>{badge.label}</Badge>
                        <span className="text-sm font-black text-zinc-950">{count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs font-bold uppercase text-zinc-500">No member products tracked yet</p>
              )}
            </CardContent>
          </Card>

          {/* Member Products Table */}
          <Card className="rounded-none border border-zinc-950 flex-1 flex flex-col min-h-0 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <CardHeader className="bg-zinc-50 border-b border-zinc-950 shrink-0">
              <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-zinc-950">
                <Package className="h-5 w-5" />
                Products ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
              {members.length === 0 ? (
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 text-center py-12">
                  No products in this cohort
                </p>
              ) : (
                <div className="h-full overflow-auto">
                  <Table>
                    <TableHeader className="bg-zinc-100 sticky top-0 z-10">
                      <TableRow className="border-b border-zinc-950">
                        <TableHead className="font-black uppercase text-zinc-950 text-xs w-[120px]">SKU</TableHead>
                        <TableHead className="font-black uppercase text-zinc-950 text-xs">Product Name</TableHead>
                        <TableHead className="font-black uppercase text-zinc-950 text-xs w-[150px]">Pipeline Status</TableHead>
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
                          <TableRow key={member.product_sku} className="border-b border-zinc-200">
                            <TableCell className="font-mono text-sm bg-zinc-50 w-[120px]">
                              {member.product_sku}
                            </TableCell>
                            <TableCell className="font-bold text-zinc-950 max-w-md">
                              <div className="truncate" title={inputData?.name || ""}>
                                {inputData?.name || (
                                  <span className="text-zinc-400 italic font-medium">
                                    No name
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="w-[150px]">
                              {badge ? (
                                <Badge className={`text-[10px] font-black uppercase rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] ${badge.className}`}>
                                  {badge.label}
                                </Badge>
                              ) : (
                                <span className="text-zinc-400 text-[10px] font-black uppercase">
                                  Not tracked
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Recommendations */}
        <div className="w-full lg:w-80 space-y-6 shrink-0">
          <Card className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <CardHeader className="bg-zinc-50 border-b border-zinc-950">
              <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-zinc-950">
                <Sparkles className="h-5 w-5" />
                Scrapers
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {!brandName ? (
                <div className="text-center py-6">
                  <Sparkles className="h-8 w-8 text-zinc-300 mx-auto mb-3" />
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                    Assign a brand to see scraper recommendations
                  </p>
                </div>
              ) : loadingRecs ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-forest-green" />
                </div>
              ) : recommendations.length === 0 ? (
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 text-center py-6">
                  No scraper data available yet
                </p>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((rec) => {
                    const conf = CONFIDENCE_CONFIG[rec.confidence] || CONFIDENCE_CONFIG.untested;

                    return (
                      <div
                        key={rec.scraper_slug}
                        className={`rounded-none border p-3 transition-colors shadow-[1px_1px_0px_rgba(0,0,0,1)] ${
                          rec.preselected
                            ? "border-brand-forest-green bg-brand-forest-green/5"
                            : "border-zinc-950"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {rec.preselected && (
                              <Zap className="h-3.5 w-3.5 text-brand-forest-green fill-brand-forest-green" />
                            )}
                            <span className="font-black uppercase tracking-tight text-sm text-zinc-950">
                              {rec.scraper_name}
                            </span>
                          </div>
                          <Badge className={`text-[9px] font-black uppercase rounded-none border border-zinc-950 ${conf.className}`}>
                            {conf.label}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <HitRateBar rate={rec.hit_rate} />
                          <p className="text-[10px] font-bold uppercase text-zinc-600 leading-tight">
                            {rec.reason}
                          </p>
                          {rec.total_attempts > 0 && (
                            <div className="pt-1 border-t border-zinc-200">
                              <p className="text-[9px] font-black uppercase text-zinc-500">
                                {rec.successful_extractions}/{rec.total_attempts} hits ·{" "}
                                {rec.avg_fields_extracted.toFixed(1)} fields ·{" "}
                                {rec.avg_images_found.toFixed(1)} imgs
                              </p>
                            </div>
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
          <Card className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <CardHeader className="bg-zinc-50 border-b border-zinc-950">
              <CardTitle className="text-lg font-black uppercase tracking-tight text-zinc-950">Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                <span className="text-[10px] font-black uppercase text-zinc-500">ID</span>
                <code className="font-mono text-[10px] bg-zinc-100 px-1">{cohort.id.slice(0, 12)}...</code>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                <span className="text-[10px] font-black uppercase text-zinc-500">UPC Prefix</span>
                <code className="font-mono text-xs font-black bg-zinc-950 text-white px-1">{cohort.upc_prefix}</code>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                <span className="text-[10px] font-black uppercase text-zinc-500">Created</span>
                <span className="text-xs font-bold uppercase text-zinc-950">{new Date(cohort.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-zinc-500">Updated</span>
                <span className="text-xs font-bold uppercase text-zinc-950">{new Date(cohort.updated_at).toLocaleDateString()}</span>
              </div>
              {cohort.scraper_config && (
                <div className="flex justify-between items-center pt-2 border-t border-zinc-100">
                  <span className="text-[10px] font-black uppercase text-zinc-500">Config</span>
                  <Badge variant="outline" className="rounded-none border border-zinc-950 text-[9px] font-black uppercase">{cohort.scraper_config}</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {editingBrand && (
        <BrandModal
          brand={editingBrand}
          onClose={() => setEditingBrand(null)}
          onSave={(savedBrand) => {
            setEditingBrand(savedBrand ?? null);
            void fetchCohort();
          }}
        />
      )}
    </div>
  );
}
