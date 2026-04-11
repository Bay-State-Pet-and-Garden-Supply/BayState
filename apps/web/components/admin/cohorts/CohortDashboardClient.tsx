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
  Tag,
  Sparkles,
  Edit2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CohortBrandBadge } from "./CohortBrandBadge";

interface BrandInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

interface CohortBatch {
  id: string;
  upc_prefix: string;
  product_line: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  scraper_config: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brands: BrandInfo | null;
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
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bgColor} ${config.color}`}
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
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
          <div className={`rounded-lg p-3 ${color}`}>
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

  const handleAssignBrand = async (cohortId: string, brandName: string) => {
    try {
      const response = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brandName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to assign brand");
      }

      toast.success(`Brand "${brandName}" assigned`, {
        description: "Scraper recommendations will now be available.",
      });

      await fetchCohorts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign brand");
    }
  };

  if (loading && cohorts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && cohorts.length === 0) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900">Error Loading Cohorts</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="mt-3"
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
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Cohort Batch Monitoring
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time monitoring of product line scraping cohorts. Assign brands to
            enable automatic scraper recommendations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionIndicator isConnected={isConnected} />
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Cohorts"
          value={stats.total}
          icon={Package}
          color="bg-gray-500"
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={Clock}
          color="bg-gray-400"
        />
        <StatCard
          title="Processing"
          value={stats.processing}
          icon={Activity}
          color="bg-blue-500"
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={CheckCircle}
          color="bg-green-500"
        />
        <StatCard
          title="Failed"
          value={stats.failed}
          icon={XCircle}
          color="bg-red-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          {(["all", "pending", "processing", "completed", "failed"] as const).map(
            (filter) => (
              <Button
                key={filter}
                variant={statusFilter === filter ? "default" : "outline"}
                size="sm"
                onClick={() => handleStatusFilterChange(filter)}
              >
                {filter === "all" ? "All" : STATUS_CONFIG[filter].label}
              </Button>
            )
          )}
        </div>
      </div>

      {cohorts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-foreground">
              No cohorts found
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {statusFilter === "all"
                ? "Cohort batches will appear here when created"
                : `No ${statusFilter} cohorts`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-3">
            {cohorts.map((cohort) => {
              const config = STATUS_CONFIG[cohort.status];
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

              return (
                <Card
                  key={cohort.id}
                  className={`border-l-4 ${config.borderColor} hover:shadow-md transition-shadow`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium text-foreground">
                            {cohort.product_line || `Cohort ${cohort.id.slice(0, 8)}`}
                          </h3>
                          <StatusBadge status={cohort.status} />
                          <CohortBrandBadge 
                            cohortId={cohort.id} 
                            brandName={cohort.brand_name || cohort.brands?.name || null} 
                            onAssign={handleAssignBrand} 
                          />
                        </div>

                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">
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
                              <Badge variant="outline" className="text-xs">
                                Config: {cohort.scraper_config}
                              </Badge>
                            </div>
                          )}

                          {hasBrand && (
                            <div className="mt-1">
                              <Badge variant="outline" className="text-xs gap-1">
                                <Sparkles className="h-3 w-3" />
                                Recommendations available
                              </Badge>
                            </div>
                          )}

                          {cohort.status === "failed" && metadataErrorText && (
                              <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
                                <strong>Error:</strong>{" "}
                                {metadataErrorText}
                              </div>
                            )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
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
