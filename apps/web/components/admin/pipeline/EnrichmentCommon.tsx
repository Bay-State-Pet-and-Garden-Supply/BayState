"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  X,
  Terminal as TerminalIcon,
  Copy,
  Check,
  ExternalLink
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useJobConsole } from "@/hooks/useJobConsole";
import type { EnrichmentAttempt } from "@/lib/realtime/types";

export const statusIconMap: Record<string, typeof Activity> = {
  queued: Clock,
  pending: Clock,
  running: Loader2,
  claimed: Loader2,
  completed: CheckCircle2,
  completed_with_errors: AlertCircle,
  failed: AlertCircle,
  cancelled: X,
};

export const statusColorMap: Record<string, string> = {
  queued: "text-zinc-400 dark:text-zinc-500",
  pending: "text-zinc-400 dark:text-zinc-500",
  running: "text-emerald-500 animate-pulse",
  claimed: "text-emerald-500 animate-pulse",
  completed: "text-teal-500",
  completed_with_errors: "text-amber-500",
  failed: "text-rose-500",
  cancelled: "text-zinc-400 dark:text-zinc-500",
};

export const statusBgMap: Record<string, string> = {
  queued: "bg-zinc-50 border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800",
  pending: "bg-zinc-50 border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800",
  running: "bg-emerald-50/30 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-900/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]",
  claimed: "bg-emerald-50/30 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-900/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]",
  completed: "bg-teal-50/20 border-teal-100 dark:bg-teal-950/5 dark:border-teal-900/20",
  completed_with_errors: "bg-amber-50/20 border-amber-100 dark:bg-amber-950/5 dark:border-amber-900/20",
  failed: "bg-rose-50/20 border-rose-100 dark:bg-rose-950/5 dark:border-rose-900/20",
  cancelled: "bg-zinc-50 border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800",
};

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleString();
}

export function getElapsed(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) return "--";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diff = Math.floor((end - start) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

export function getDisplaySite(url?: string | null): string {
  if (!url) return "URL Candidate Search";
  if (url === "approved_source_extraction" || url.includes("approved_source")) return "Approved Sources";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace("www.", "");
  } catch {
    return url.length > 30 ? url.slice(0, 30) + "..." : url;
  }
}

// Inline Timer to keep elapsed times updating live
export function LiveTimer({
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

interface EnrichmentAttemptCardProps {
  attempt: EnrichmentAttempt;
}

export function EnrichmentAttemptCard({ attempt }: EnrichmentAttemptCardProps) {
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
 * Terminal-style Logging Console
 */
export function EnrichmentJobLogsConsole({ jobId }: { jobId: string }) {
  const { allLogs, isLoading, isConnected, error } = useJobConsole({ jobId });
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
        ) : error && allLogs.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 text-rose-400" />
            <span>Failed to load job logs: {error.message}</span>
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
