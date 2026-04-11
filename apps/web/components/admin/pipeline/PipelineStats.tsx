"use client";

import { Package, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatusCount, PipelineStatus } from "@/lib/pipeline";

interface PipelineStatsProps {
  counts: StatusCount[];
  trends?: Record<string, number>;
  onStatusChange?: (status: PipelineStatus) => void;
  isLoading?: boolean;
}

const statusConfig: Array<{
  status: PipelineStatus;
  label: string;
  icon: typeof Package;
  color: string;
  bgColor: string;
}> = [
  {
    status: "imported",
    label: "Imported",
    icon: Package,
    color: "text-brand-forest-green",
    bgColor: "bg-brand-forest-green/10",
  },
  {
    status: "scraped",
    label: "Scraped",
    icon: Sparkles,
    color: "text-brand-burgundy",
    bgColor: "bg-brand-burgundy/10",
  },
  {
    status: "finalized",
    label: "Finalized",
    icon: CheckCircle2,
    color: "text-brand-forest-green",
    bgColor: "bg-brand-forest-green/10",
  },
];

function TrendIndicator({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <span
      className={cn(
        "text-xs font-medium",
        isPositive ? "text-green-600" : "text-red-600",
      )}
    >
      {isPositive ? "↑" : "↓"} {Math.abs(value)}%
    </span>
  );
}

function getCountForStatus(
  counts: StatusCount[],
  status: PipelineStatus,
): number {
  const found = counts.find((c) => c.status === status);
  return found?.count ?? 0;
}

export function PipelineStats({
  counts,
  trends,
  onStatusChange,
  isLoading = false,
}: PipelineStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {statusConfig.map((config) => {
        const count = getCountForStatus(counts, config.status);
        const trend = trends?.[config.status];
        const Icon = config.icon;

        return (
          <Card
            key={config.status}
            className={cn(
              "cursor-pointer transition-shadow hover:shadow-md",
              onStatusChange ? "hover:ring-2 hover:ring-primary/20" : "",
            )}
            onClick={() => onStatusChange?.(config.status)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {config.label}
              </CardTitle>
              <div className={cn("rounded-full p-2", config.bgColor)}>
                <Icon className={cn("h-4 w-4", config.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">
                  {count.toLocaleString()}
                </span>
                {trend !== undefined && <TrendIndicator value={trend} />}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
