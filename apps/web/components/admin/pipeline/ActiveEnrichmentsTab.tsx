"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  X,
  Terminal as TerminalIcon,
  Cpu,
  Layers,
  RefreshCw,
  Server,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PIPELINE_RUN_STATUS_LABELS } from "@/lib/pipeline/run-types";
import type { PipelineRunStatus } from "@/lib/pipeline/run-types";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/admin/api-client";

import { useJobSubscription } from "@/lib/realtime/useJobSubscription";
import { useRunnerPresence } from "@/lib/realtime/useRunnerPresence";
import { useJobConsole } from "@/hooks/useJobConsole";
import { useAttemptsSubscription } from "@/lib/realtime/useAttemptsSubscription";
import type { JobAssignment, EnrichmentAttempt } from "@/lib/realtime/types";

const statusIconMap: Record<string, typeof Activity> = {
  queued: Clock,
  pending: Clock,
  running: Loader2,
  claimed: Loader2,
  completed: CheckCircle2,
  completed_with_errors: AlertCircle,
  failed: AlertCircle,
  cancelled: X,
};

const statusColorMap: Record<string, string> = {
  queued: "text-zinc-400 dark:text-zinc-500",
  pending: "text-zinc-400 dark:text-zinc-500",
  running: "text-emerald-500 animate-pulse",
  claimed: "text-emerald-500 animate-pulse",
  completed: "text-teal-500",
  completed_with_errors: "text-amber-500",
  failed: "text-rose-500",
  cancelled: "text-zinc-400 dark:text-zinc-500",
};

const statusBgMap: Record<string, string> = {
  queued: "bg-zinc-50 border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800",
  pending: "bg-zinc-50 border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800",
  running: "bg-emerald-50/30 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-900/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]",
  claimed: "bg-emerald-50/30 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-900/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]",
  completed: "bg-teal-50/20 border-teal-100 dark:bg-teal-950/5 dark:border-teal-900/20",
  completed_with_errors: "bg-amber-50/20 border-amber-100 dark:bg-amber-950/5 dark:border-amber-900/20",
  failed: "bg-rose-50/20 border-rose-100 dark:bg-rose-950/5 dark:border-rose-900/20",
  cancelled: "bg-zinc-50 border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800",
};

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleString();
}

function getElapsed(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) return "--";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diff = Math.floor((end - start) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function getProgressPercent(job: JobAssignment): number {
  if (job.total_count && job.total_count > 0) {
    const completed = job.completed_count ?? 0;
    return Math.round((completed / job.total_count) * 100);
  }
  if (typeof job.progress_percent === "number") {
    return job.progress_percent;
  }
  return 0;
}

// Inline Timer to keep elapsed times updating live
function LiveTimer({
  startedAt,
  completedAt,
  status,
}: {
  startedAt?: string | null;
  completedAt?: string | null;
  status: string;
}) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      setElapsed(getElapsed(startedAt, completedAt));
    };

    update();
    const isActive = status === "running" || status === "claimed" || status === "queued";
    if (isActive && startedAt && !completedAt) {
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    }
  }, [startedAt, completedAt, status]);

  return <span className="font-semibold font-mono text-foreground">{elapsed}</span>;
}

/**
 * Cluster Telemetry Panel
 */
function ScraperClusterTelemetry() {
  const { getOnlineCount, getBusyCount, isConnected } = useRunnerPresence();

  const onlineCount = getOnlineCount();
  const busyCount = getBusyCount();
  const idleCount = Math.max(0, onlineCount - busyCount);

  return (
    <Card className="border border-border/80 bg-card/65 backdrop-blur-md shadow-sm overflow-hidden">
      <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/5 border border-border/50 rounded-lg">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold uppercase tracking-wide text-foreground">Scraper Cluster</h4>
              <span className="inline-flex items-center gap-1 bg-white border border-border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter">
                <span className={cn("h-1.5 w-1.5 rounded-none", isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
                {isConnected ? "Realtime Link" : "Offline"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Observing background crawl4ai orchestration agents
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 md:gap-8 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0 border-border/50">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground font-medium">Online Nodes</span>
            <span className="text-lg font-black text-foreground font-mono">{onlineCount}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground font-medium">Busy</span>
            <span className="text-lg font-black text-emerald-500 font-mono">{busyCount}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground font-medium">Idle Ready</span>
            <span className="text-lg font-black text-zinc-500 font-mono">{idleCount}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getDisplaySite(url?: string | null): string {
  if (!url) return "URL Candidate Search";
  if (url === "approved_source_extraction" || url.includes("approved_source")) return "Approved Sources";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace("www.", "");
  } catch {
    return url.length > 30 ? url.slice(0, 30) + "..." : url;
  }
}

interface EnrichmentAttemptCardProps {
  attempt: EnrichmentAttempt;
}

function EnrichmentAttemptCard({ attempt }: EnrichmentAttemptCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(attempt.upc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCompleted =
    attempt.status === "success" ||
    attempt.status === "partial" ||
    attempt.status === "completed";
  const isFailed = attempt.status === "failed";
  const isRunning = attempt.status === "running";
  const isQueued =
    attempt.status === "queued" ||
    attempt.status === "pending";

  const resultObj = attempt.result as any;
  const resultProductName = resultObj?.product?.name;
  const dbProductName = attempt.products_ingestion?.input?.name;
  const productName = resultProductName || dbProductName || "Unnamed Product";

  const brandName = attempt.products_ingestion?.brands?.name || "Generic";
  const productLine = attempt.products_ingestion?.product_line;

  const price = resultObj?.product?.price;
  const weight = resultObj?.product?.weight;
  const imageCount = resultObj?.product?.image_urls ? resultObj.product.image_urls.length : 0;
  const images = resultObj?.product?.image_urls || [];

  return (
    <div
      className={cn(
        "p-3.5 border transition-all duration-300 rounded-lg flex flex-col gap-2 bg-card hover:shadow-md",
        isCompleted && "border-teal-200 dark:border-teal-900/60 shadow-[0_1px_4px_rgba(13,148,136,0.03)]",
        isFailed && "border-rose-200 dark:border-rose-900/60 shadow-[0_1px_4px_rgba(225,29,72,0.03)]",
        isRunning && "border-emerald-300 dark:border-emerald-800 shadow-[0_0_12px_rgba(16,185,129,0.08)] animate-pulse",
        isQueued && "border-zinc-200 dark:border-zinc-800"
      )}
    >
      {/* Title & Brand Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span 
            className="font-bold text-xs text-foreground leading-tight line-clamp-2 select-text" 
            title={productName}
          >
            {productName}
          </span>
          
          {/* Status Badge */}
          <span
            className={cn(
              "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border shrink-0 rounded-md",
              isCompleted && "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-900",
              isFailed && "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900",
              isRunning && "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
              isQueued && "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-950/40 dark:text-zinc-400 dark:border-zinc-900"
            )}
          >
            {attempt.status}
          </span>
        </div>

        {/* Brand & Product Line Lineage */}
        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
          <span className="font-semibold text-muted-foreground">
            {brandName}
          </span>
          {productLine && (
            <>
              <span className="text-zinc-300 dark:text-zinc-700">•</span>
              <span className="text-zinc-500 font-medium">
                {productLine}
              </span>
            </>
          )}
        </div>
      </div>

      {/* UPC / Identifiers & Copy */}
      <div className="flex items-center justify-between border-t border-b border-border/40 py-1.5 my-0.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-bold text-foreground bg-muted border border-border/80 px-1.5 py-0.5 select-all">
            {attempt.upc}
          </span>
          <button 
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-sm hover:bg-muted"
            title="Copy UPC"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>

        <div className="text-[10px] font-medium text-foreground/80 flex items-center gap-1 truncate max-w-[120px]">
          <span className="truncate select-text" title={attempt.source_url || ""}>
            {getDisplaySite(attempt.source_url)}
          </span>
          {attempt.source_url && (
            <a 
              href={attempt.source_url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-muted-foreground hover:text-foreground inline-flex shrink-0 ml-0.5"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>

      {/* Telemetry info grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground">
        <div className="flex flex-col">
          <span className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wider">Runner Node</span>
          <span className="font-bold text-foreground truncate">
            {attempt.claimed_by ? `🤖 ${attempt.claimed_by}` : "⏳ Claim pending"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wider">Duration</span>
          <span className="font-bold text-foreground font-mono">
            <LiveTimer startedAt={attempt.started_at} completedAt={attempt.completed_at ?? undefined} status={attempt.status} />
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wider">Scrape Mode</span>
          <span className="font-bold text-foreground uppercase tracking-wide text-[9px]">
            {attempt.mode || "mixed"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wider">AI Model</span>
          <span className="font-bold text-foreground truncate">
            {attempt.model || "None"}
          </span>
        </div>
      </div>

      {/* Extracted Quality Check (Success / Partial) */}
      {isCompleted && (
        <div className="mt-1 p-2 bg-muted/20 border border-border/60 rounded-md flex flex-col gap-1.5">
          <span className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider">Extracted Quality Details</span>
          <div className="flex items-center gap-3 text-[10px]">
            <div className="flex items-center gap-1 font-semibold">
              <span className={cn(price ? "text-emerald-500" : "text-zinc-400")}>●</span>
              <span>Price: {price ? `$${price}` : "Missing"}</span>
            </div>
            {weight && (
              <div className="flex items-center gap-1 font-semibold text-zinc-600">
                <span>Weight: {weight}</span>
              </div>
            )}
            <div className="flex items-center gap-1 font-semibold">
              <span className={cn(imageCount > 0 ? "text-emerald-500" : "text-amber-500")}>●</span>
              <span>Images: {imageCount}</span>
            </div>
          </div>

          {/* Extracted Image Thumbnails */}
          {images.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1 overflow-x-auto pb-0.5">
              {images.slice(0, 4).map((img: any, idx: number) => {
                const src = img.data_url || img.url;
                if (!src) return null;
                return (
                  <div key={idx} className="relative w-8 h-8 rounded-md overflow-hidden border border-border shrink-0 hover:scale-110 transition-transform duration-200">
                    <img 
                      src={src} 
                      alt={`Extracted ${idx + 1}`} 
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                );
              })}
              {images.length > 4 && (
                <div className="w-8 h-8 rounded-md bg-muted border border-border/80 flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0">
                  +{images.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error Output block */}
      {attempt.error_message && (
        <div className="text-[9px] font-mono text-rose-600 bg-rose-500/5 border border-rose-500/10 p-2 mt-1 rounded-md max-h-24 overflow-y-auto break-words whitespace-pre-wrap">
          {attempt.error_message}
        </div>
      )}
    </div>
  );
}

/**
 * UPC attempt breakdown section (Live updates)
 */
function EnrichmentJobAttemptsPanel({ jobId }: { jobId: string }) {
  const { attempts, isConnected, refetch } = useAttemptsSubscription({ jobId });

  if (attempts.length === 0 && !isConnected) {
    return (
      <div className="p-6 text-center text-xs font-semibold text-muted-foreground/60 border-t border-border bg-muted/5 flex items-center justify-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading UPC attempts breakdown...
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="p-6 text-center text-xs font-semibold text-muted-foreground border-t border-border bg-muted/5">
        No UPCs have been claimed by runners for this run yet.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted/5 divide-y divide-border/40">
      <div className="px-4 py-2 bg-muted/10 flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        <span>UPC Telemetry</span>
        <Button variant="ghost" size="sm" onClick={() => void refetch()} className="h-5 px-1.5 text-[9px] gap-1 rounded-none border border-border">
          <RefreshCw className="h-2.5 w-2.5" /> Force Sync
        </Button>
      </div>
      <div className="overflow-y-auto max-h-[600px] pr-1 scrollbar-thin">
        <div className="p-3 pb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {attempts.map((attempt) => (
            <EnrichmentAttemptCard key={attempt.id} attempt={attempt} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Terminal-style Logging Console
 */
function EnrichmentJobLogsConsole({ jobId }: { jobId: string }) {
  const { allLogs, isLoading, isConnected } = useJobConsole({ jobId });
  const [levels, setLevels] = useState<Record<string, boolean>>({
    debug: false, // Debug disabled by default to prevent spam
    info: true,
    warning: true,
    error: true,
    critical: true,
  });
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => levels[log.level.toLowerCase()] ?? true);
  }, [allLogs, levels]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filteredLogs, autoScroll]);

  const toggleLevel = (level: string) => {
    setLevels((prev) => ({ ...prev, [level]: !prev[level] }));
  };

  const getLogColorClass = (level: string) => {
    switch (level.toLowerCase()) {
      case "critical":
      case "error":
        return "text-rose-400 font-bold bg-rose-950/20";
      case "warning":
        return "text-amber-400 font-semibold";
      case "debug":
        return "text-zinc-500";
      case "info":
      default:
        return "text-zinc-100";
    }
  };

  return (
    <div className="border-t border-border bg-zinc-950 text-zinc-200 overflow-hidden flex flex-col font-mono rounded-none">
      {/* Terminal Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-[10px] select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-3 w-3 text-zinc-400" />
          <span className="font-bold text-zinc-300 uppercase tracking-wider">Crawl4AI Engine Log Stream</span>
          <span className="inline-flex items-center gap-1 bg-zinc-850 px-1.5 py-0.5 text-[8px] border border-zinc-800 rounded-none">
            <span className={cn("h-1 w-1 rounded-none", isConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600")} />
            {isConnected ? "LIVE" : "SYNCING"}
          </span>
        </div>

        {/* Level Filters */}
        <div className="flex items-center gap-1.5">
          {Object.keys(levels).map((lvl) => (
            <button
              key={lvl}
              onClick={() => toggleLevel(lvl)}
              className={cn(
                "px-1.5 py-0.5 border text-[9px] font-bold uppercase transition-colors rounded-none",
                levels[lvl]
                  ? "bg-zinc-800 border-zinc-700 text-zinc-200"
                  : "bg-transparent border-zinc-850 text-zinc-600 hover:text-zinc-400"
              )}
            >
              {lvl.slice(0, 4)}
            </button>
          ))}
          <label className="flex items-center gap-1 ml-2 text-[9px] text-zinc-400 cursor-pointer font-sans">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded-none border-zinc-800 bg-zinc-900 text-primary focus:ring-0 focus:ring-offset-0 size-3"
            />
            AutoScroll
          </label>
        </div>
      </div>

      {/* Terminal Console Output */}
      <ScrollArea className="h-64 p-3 bg-zinc-950/95 overflow-y-auto">
        {isLoading && allLogs.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-zinc-500 gap-2 text-xs">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-600" /> Connecting diagnostics stream...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-zinc-500 text-xs">
            No matching log entries to display. Adjust filters or wait for execution.
          </div>
        ) : (
          <div className="space-y-1 text-[11px] leading-relaxed select-text font-mono">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "flex items-start gap-2 py-0.5 px-1 hover:bg-zinc-900/40 rounded-none transition-colors",
                  getLogColorClass(log.level)
                )}
              >
                <span className="text-zinc-600 select-none shrink-0 font-medium font-sans">
                  [{new Date(log.created_at ?? log.timestamp).toLocaleTimeString()}]
                </span>
                <span className="text-[9px] font-bold uppercase select-none shrink-0 border border-zinc-800/80 px-1 py-0 bg-zinc-900/60 w-12 text-center text-zinc-400">
                  {log.level.slice(0, 4)}
                </span>
                <span className="break-all whitespace-pre-wrap flex-1">
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/**
 * Enrichment Job Card
 */
interface EnrichmentJobCardProps {
  job: JobAssignment;
  onCancel: (jobId: string) => void;
  cancellingId: string | null;
  onlineRunners: Set<string>;
}

function EnrichmentJobCard({ job, onCancel, cancellingId, onlineRunners }: EnrichmentJobCardProps) {
  const [showLogs, setShowLogs] = useState(false);
  const isActive = job.status === "queued" || job.status === "running" || job.status === "claimed" || job.status === "pending";
  const [showAttempts, setShowAttempts] = useState(isActive);

  const progressPercent = getProgressPercent(job);

  // Cross reference job runner status with Scraper network presence
  const runnerName = job.claimed_by || job.runner_name;
  const isRunnerOnline = runnerName ? onlineRunners.has(runnerName) : false;

  return (
    <Card className={cn(
      "border border-border/80 bg-card/65 backdrop-blur-md hover:shadow-md transition-all duration-300 rounded-none overflow-hidden",
      statusBgMap[job.status]
    )}>
      <CardHeader className="pb-3 pt-4 px-4 sm:px-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left Details */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={statusColorMap[job.status]}>
              {(() => {
                const Icon = statusIconMap[job.status] ?? Activity;
                return <Icon className={cn("h-4 w-4", (job.status === "running" || job.status === "claimed") && "animate-spin")} />;
              })()}
            </span>
            <CardTitle className="text-sm font-bold tracking-tight text-foreground">
              Run {job.id.slice(0, 8)}
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-bold uppercase rounded-none tracking-wider px-2 py-0.5">
              {job.mode ?? "mixed"}
            </Badge>
            {job.model && (
              <Badge variant="secondary" className="text-[10px] font-bold rounded-none bg-zinc-100 text-zinc-900 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 px-2 py-0.5">
                {job.model}
              </Badge>
            )}
            {runnerName && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 border border-border bg-white rounded-none">
                <span className={cn("h-1.5 w-1.5 rounded-none", isRunnerOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500 animate-pulse")} />
                Node: {runnerName} {!isRunnerOnline && isActive && <span className="text-rose-500 ml-0.5 text-[9px]">(Offline?)</span>}
              </span>
            )}
          </div>

          {/* Right Status / Actions */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Badge
              variant={isActive ? "default" : "outline"}
              className={cn(
                "text-[10px] font-bold uppercase tracking-wider rounded-none border",
                job.status === "completed" && "bg-teal-500/10 text-teal-700 border-teal-500/20 dark:text-teal-400",
                job.status === "failed" && "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-400",
                job.status === "cancelled" && "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800",
                isActive && "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400"
              )}
            >
              {PIPELINE_RUN_STATUS_LABELS[job.status as PipelineRunStatus] ?? job.status}
            </Badge>

            {isActive && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 rounded-none border border-transparent hover:border-rose-500/25 transition-all"
                onClick={() => onCancel(job.id)}
                disabled={cancellingId === job.id}
                title="Cancel Run"
              >
                {cancellingId === job.id ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-4 pt-0 px-4 sm:px-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground block font-medium">Telemetry Units</span>
            <p className="font-bold text-foreground font-mono mt-0.5">
              {job.completed_count ?? 0} / {job.total_count ?? 0} UPCs
            </p>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Failed</span>
            <p className={cn("font-bold font-mono mt-0.5", (job.failed_count ?? 0) > 0 ? "text-rose-500" : "text-foreground")}>
              {job.failed_count ?? 0}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Elapsed Duration</span>
            <p className="font-medium mt-0.5">
              <LiveTimer startedAt={job.started_at} completedAt={job.completed_at} status={job.status} />
            </p>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">{job.completed_at ? "Finished" : "Created"}</span>
            <p className="font-medium mt-0.5 text-zinc-500">
              {formatDate(job.completed_at ?? job.created_at)}
            </p>
          </div>
        </div>

        {/* Cost estimate if completed */}
        {!isActive && job.cost_estimate ? (
          <div className="mt-3 text-[10px] text-zinc-500 font-semibold border-t border-border/40 pt-2 flex items-center gap-1.5">
            <Cpu className="h-3 w-3 text-zinc-400" />
            Consolidated AI Inference Cost Estimate:
            <span className="text-foreground font-mono font-bold">${Number(job.cost_estimate).toFixed(4)}</span>
          </div>
        ) : null}

        {job.error_message && (
          <div className="mt-3 p-2.5 bg-rose-500/5 border border-rose-500/15 rounded-none text-xs text-rose-600 font-mono break-all whitespace-pre-wrap">
            {job.error_message}
          </div>
        )}

        {/* Progress Bar */}
        {job.total_count && job.total_count > 0 ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground mb-1 select-none">
              <span>EXTRACTION PIPELINE PROGRESS</span>
              <span className="font-mono">{progressPercent}%</span>
            </div>
            <div className="h-2 bg-secondary/80 border border-border/30 rounded-none overflow-hidden flex">
              <div
                className={cn(
                  "h-full transition-all duration-500 relative",
                  (job.failed_count ?? 0) > 0 ? "bg-amber-500" : "bg-emerald-500",
                  (job.status === "running" || job.status === "claimed") && "bg-gradient-to-r from-emerald-500 to-teal-500 overflow-hidden"
                )}
                style={{ width: `${progressPercent}%` }}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[shimmer_1s_linear_infinite]" />
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Action Panel Toggles */}
        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between gap-2 select-none">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAttempts(!showAttempts);
                setShowLogs(false);
              }}
              className={cn(
                "text-[10px] font-bold h-7 gap-1.5 rounded-none border border-border transition-colors",
                showAttempts && "bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              UPC Details
              {showAttempts ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowLogs(!showLogs);
                setShowAttempts(false);
              }}
              className={cn(
                "text-[10px] font-bold h-7 gap-1.5 rounded-none border border-border transition-colors",
                showLogs && "bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700"
              )}
            >
              <TerminalIcon className="h-3.5 w-3.5" />
              Console Logs
              {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Expandable Sections */}
      {showAttempts && <EnrichmentJobAttemptsPanel jobId={job.id} />}
      {showLogs && <EnrichmentJobLogsConsole jobId={job.id} />}
    </Card>
  );
}

/**
 * Main active enrichments view component
 */
export function ActiveEnrichmentsTab() {
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [showRecentCompleted, setShowRecentCompleted] = useState(false);
  
  // Selection state for master-detail view
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  // Connect to Supabase Scraper runner presence
  const { onlineIds: onlineRunners } = useRunnerPresence();

  // Connect to Supabase Enrichment Jobs table real-time changes
  const {
    jobs: realtimeJobs,
    error: jobsError,
    refetch: forceSyncJobs
  } = useJobSubscription({
    maxJobsPerStatus: 50,
  });

  const handleCancelJob = async (jobId: string) => {
    if (!window.confirm("Are you sure you want to cancel this enrichment run?")) return;

    setCancellingJobId(jobId);
    try {
      const res = await adminFetch(`/api/admin/enrichment/jobs?id=${jobId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Enrichment run cancelled successfully");
        void forceSyncJobs();
      } else {
        toast.error(data.error || "Failed to cancel enrichment run");
      }
    } catch (err) {
      console.error("Error cancelling job:", err);
      toast.error("Failed to cancel enrichment run");
    } finally {
      setCancellingJobId(null);
    }
  };

  // Ensure stable combined active jobs for grouping
  const allJobs = useMemo(() => {
    return [
      ...realtimeJobs.pending,
      ...realtimeJobs.queued,
      ...realtimeJobs.running,
      ...realtimeJobs.completed,
      ...realtimeJobs.completed_with_errors,
      ...realtimeJobs.failed,
      ...realtimeJobs.cancelled,
    ];
  }, [realtimeJobs]);

  // Combine and sort active/queued jobs
  const activeJobs = useMemo(() => {
    const combined = [
      ...realtimeJobs.pending,
      ...realtimeJobs.queued,
      ...realtimeJobs.running,
    ];
    return combined.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [realtimeJobs]);

  // Combine and sort completed/failed/cancelled jobs
  const completedJobs = useMemo(() => {
    const combined = [
      ...realtimeJobs.completed,
      ...realtimeJobs.completed_with_errors,
      ...realtimeJobs.failed,
      ...realtimeJobs.cancelled,
    ];
    return combined.sort(
      (a, b) => {
        const timeA = a.completed_at ? new Date(a.completed_at).getTime() : new Date(a.created_at).getTime();
        const timeB = b.completed_at ? new Date(b.completed_at).getTime() : new Date(b.created_at).getTime();
        return timeB - timeA;
      }
    );
  }, [realtimeJobs]);

  const hasNoJobs = activeJobs.length === 0 && completedJobs.length === 0;

  return (
    <div className="space-y-6">
      {/* Cluster Telemetry Dashboard Header */}
      <ScraperClusterTelemetry />

      {jobsError && (
        <div className="rounded-none border border-rose-500/25 bg-rose-500/[0.02] p-3 text-rose-500 font-mono text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>Realtime Connection Failure: {jobsError.message}. Retrying...</span>
        </div>
      )}

      {/* In Progress Jobs */}
      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between select-none">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Extraction In Progress ({activeJobs.length})
            </h3>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-none bg-emerald-500 animate-ping" />
              Live Link Synced
            </span>
          </div>
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <EnrichmentJobCard
                key={job.id}
                job={job}
                onCancel={handleCancelJob}
                cancellingId={cancellingJobId}
                onlineRunners={onlineRunners}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Completed / Failed Runs */}
      {completedJobs.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-border/40">
          <div className="flex items-center justify-between select-none">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Recent Extraction Batches ({completedJobs.length})
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRecentCompleted(!showRecentCompleted)}
              className="h-7 text-[10px] font-bold gap-1 rounded-none border border-border"
            >
              {showRecentCompleted ? "Hide History" : "Show History"}
            </Button>
          </div>
          {showRecentCompleted && (
            <div className="space-y-3">
              {completedJobs.slice(0, 10).map((job) => (
                <EnrichmentJobCard
                  key={job.id}
                  job={job}
                  onCancel={handleCancelJob}
                  cancellingId={cancellingJobId}
                  onlineRunners={onlineRunners}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {hasNoJobs && !jobsError && (
        <div className="text-center py-16 border border-dashed border-border bg-card/20 rounded-none">
          <Activity className="size-10 mx-auto mb-3 opacity-30 text-muted-foreground" />
          <h4 className="text-sm font-bold text-foreground">No Extraction Telemetry</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Select products in URL Candidate Discovery and start extraction to see active runs streaming live.
          </p>
        </div>
      )}
    </div>
  );
}
