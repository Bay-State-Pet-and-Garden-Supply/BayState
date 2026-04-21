"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Package,
  Wifi,
  WifiOff,
  XCircle,
  RefreshCw,
  Filter,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { CohortBrandBadge } from "./CohortBrandBadge";
import type { CohortBrandInfo } from "./types";
import { isConfiguredBrand } from "./types";

interface CohortBatch {
  id: string;
  name: string | null;
  upc_prefix: string;
  product_line: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  scraper_config: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brands: CohortBrandInfo | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

interface CohortStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

type StatusFilter = "all" | "pending" | "processing" | "completed" | "failed";

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    borderColor: "border-muted",
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
};

function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {isConnected ? (
        <>
          <Wifi className="h-3.5 w-3.5 text-primary" />
          <span className="text-primary font-medium">Live</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Disconnected</span>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CohortBatch["status"] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[10px] font-black uppercase tracking-tight border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] ${config.bgColor} ${config.color}`}
    >
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}



function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: typeof Activity;
  color: string;
}) {
  return (
    <Card className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">{title}</p>
            <p className="text-3xl font-black tracking-tighter text-zinc-950">{value}</p>
          </div>
          <div className={`rounded-none border border-zinc-950 p-3 shadow-[1px_1px_0px_rgba(0,0,0,1)] ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CohortDashboardClient() {
  const [cohorts, setCohorts] = useState<CohortBatch[]>([]);
  const [stats, setStats] = useState<CohortStats>({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isConnected, setIsConnected] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCohorts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      const response = await fetch(`/api/admin/cohorts?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch cohorts");

      const data = await response.json();
      setCohorts(data.cohorts || []);

      const allCohorts = data.cohorts || [];
      setStats({
        total: allCohorts.length,
        pending: allCohorts.filter((c: CohortBatch) => c.status === "pending").length,
        processing: allCohorts.filter((c: CohortBatch) => c.status === "processing").length,
        completed: allCohorts.filter((c: CohortBatch) => c.status === "completed").length,
        failed: allCohorts.filter((c: CohortBatch) => c.status === "failed").length,
      });

      setError(null);
      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsConnected(false);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchCohorts();
  }, [fetchCohorts]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchCohorts();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchCohorts]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchCohorts();
    toast.success("Dashboard refreshed");
  };

  const handleStatusFilterChange = (newFilter: StatusFilter) => {
    setStatusFilter(newFilter);
    setLoading(true);
  };

  const handleAssignBrand = async (cohortId: string, brand: CohortBrandInfo | null) => {
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
            ? "Scraper recommendations will now be available."
            : "Brand assigned. Add site/domain details to strengthen AI Search guidance.",
        });
      } else {
        toast.success("Brand assignment cleared");
      }

      await fetchCohorts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign brand");
    }
  };

  if (loading && cohorts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand-forest-green" />
      </div>
    );
  }

  if (error && cohorts.length === 0) {
    return (
      <div className="rounded-none border border-zinc-950 bg-brand-burgundy/10 p-4 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-brand-burgundy shrink-0" />
          <div>
            <h3 className="font-black uppercase tracking-tight text-brand-burgundy">Error Loading Cohorts</h3>
            <p className="text-sm font-bold text-brand-burgundy/80 mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="mt-3 border-brand-burgundy text-brand-burgundy hover:bg-brand-burgundy hover:text-white"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-zinc-950">
            Cohort Monitoring
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-600">
            Real-time monitoring of product line scraping cohorts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionIndicator isConnected={isConnected} />
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 shrink-0">
        <StatCard
          title="Total Cohorts"
          value={stats.total}
          icon={Package}
          color="bg-zinc-950"
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={Clock}
          color="bg-zinc-500"
        />
        <StatCard
          title="Processing"
          value={stats.processing}
          icon={Activity}
          color="bg-brand-forest-green"
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={CheckCircle}
          color="bg-brand-forest-green"
        />
        <StatCard
          title="Failed"
          value={stats.failed}
          icon={XCircle}
          color="bg-brand-burgundy"
        />
      </div>

      <div className="flex items-center gap-3 p-2 bg-zinc-100 border border-zinc-950 rounded-none w-fit shrink-0">
        <Filter className="h-4 w-4 text-zinc-950" />
        <div className="flex items-center gap-1">
          {(["all", "pending", "processing", "completed", "failed"] as const).map(
            (filter) => (
              <Button
                key={filter}
                variant={statusFilter === filter ? "default" : "ghost"}
                size="sm"
                onClick={() => handleStatusFilterChange(filter)}
                className={statusFilter === filter ? "" : "hover:bg-zinc-200"}
              >
                {filter === "all" ? "All" : STATUS_CONFIG[filter].label}
              </Button>
            )
          )}
        </div>
      </div>

      {cohorts.length === 0 ? (
        <Card className="rounded-none border border-dashed border-zinc-300 flex-1">
          <CardContent className="flex flex-col items-center justify-center h-full text-center">
            <Package className="h-12 w-12 text-zinc-300 mb-4" />
            <h3 className="text-lg font-black uppercase text-zinc-400">
              No cohorts found
            </h3>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="flex-1 border border-zinc-950 p-1 min-h-0">
          <div className="space-y-3 pr-4">
            {cohorts.map((cohort) => {
              const timeSinceUpdate = getTimeSince(cohort.updated_at);
              const metadataError =
                typeof cohort.metadata === "object" &&
                cohort.metadata !== null &&
                "error" in cohort.metadata
                  ? cohort.metadata.error
                  : null;
              const metadataErrorText =
                metadataError === null || metadataError === undefined
                  ? null
                  : String(metadataError);
              const hasBrand = !!(cohort.brand_name || cohort.brands?.name);
              const configuredBrand = isConfiguredBrand(cohort.brands);

              return (
                <Card
                  key={cohort.id}
                  className={`rounded-none border border-zinc-950 hover:bg-zinc-50 transition-colors`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 min-w-0">
                          <h3 className="font-black uppercase tracking-tight text-zinc-950 truncate flex-1 min-w-0" title={cohort.name || cohort.product_line || `Cohort ${cohort.id.slice(0, 8)}`}>
                            {cohort.name || cohort.product_line || `Cohort ${cohort.id.slice(0, 8)}`}
                          </h3>
                          <StatusBadge status={cohort.status} />
                          <CohortBrandBadge 
                            brand={cohort.brands}
                            onAssign={(brand) => handleAssignBrand(cohort.id, brand)}
                          />
                        </div>

                        <div className="space-y-1 text-xs font-bold uppercase tracking-wide text-zinc-600">
                          <div className="flex items-center gap-2">
                            <span className="font-mono bg-zinc-950 text-white px-1 py-0.5">
                              UPC: {cohort.upc_prefix}
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <span>
                              Created: {new Date(cohort.created_at).toLocaleString()}
                            </span>
                            <span>•</span>
                            <span>Updated: {timeSinceUpdate}</span>
                          </div>

                          {cohort.scraper_config && (
                            <div className="mt-2">
                              <Badge variant="outline" className="rounded-none border border-zinc-950 font-black uppercase text-[10px]">
                                Config: {cohort.scraper_config}
                              </Badge>
                            </div>
                          )}

                          {hasBrand && (
                            <div className="mt-1">
                              <Badge variant="outline" className={`rounded-none font-black uppercase text-[10px] gap-1 ${configuredBrand ? 'border border-brand-forest-green bg-brand-forest-green/10 text-brand-forest-green' : 'border border-brand-burgundy bg-brand-burgundy/10 text-brand-burgundy'}`}>
                                <Sparkles className="h-3 w-3" />
                                {configuredBrand ? 'Recommendations ready' : 'Brand needs site setup'}
                              </Badge>
                            </div>
                          )}

                          {cohort.status === "failed" && metadataErrorText && (
                              <div className="mt-2 rounded-none border border-brand-burgundy bg-brand-burgundy/10 p-2 text-[10px] text-brand-burgundy font-black uppercase">
                                <strong>Error:</strong>{" "}
                                {metadataErrorText}
                              </div>
                            )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
                        >
                          <Link href={`/admin/cohorts/${cohort.id}`}>
                            View Details
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function getTimeSince(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "just now";
}
