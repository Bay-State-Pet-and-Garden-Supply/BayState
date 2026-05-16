"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
 Clock,
 Loader2,
 XCircle,
 CheckCircle,
 ExternalLink,
 ChevronDown,
 ChevronUp,
 AlertTriangle,
 Info,
 AlertCircle,
 Bug,
 Layers,
 Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChunkStatusTable, ChunkSummaryLine } from "./ChunkStatusTable";
import type { ChunkDetail } from "./ChunkStatusTable";
import { ProgressBar } from "./ProgressBar";
import type { LogEntry } from "@/lib/realtime/useLogSubscription";
import type { JobAssignment } from "@/lib/realtime/types";
import { progressUpdateFromJobRecord } from "@/lib/scraper-logs";

export interface ActiveJob {
 id: string;
 jobType?: string | null;
 officialBrandPhase?: string | null;
 cohortId?: string | null;
 skuCount: number;
 scrapers: string[];
 status: "pending" | "running" | "completed" | "failed" | "cancelled";
 createdAt: string;
 completedAt: string | null;
 progress: number;
 runnerName: string | null;
 progressMessage: string | null;
 progressPhase: string | null;
 currentSku: string | null;
 itemsProcessed: number | null;
 itemsTotal: number | null;
 lastLogMessage: string | null;
 lastLogLevel: string | null;
 lastLogAt: string | null;
 lastUpdateAt: string | null;
 heartbeatAt: string | null;
 chunks: ChunkDetail[];
 chunkSummary: {
 total: number;
 pending: number;
 running: number;
 completed: number;
 failed: number;
 };
}

export type ExpandPanel = "chunks" | "logs";

export type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";

const LOG_LEVEL_CONFIG: Record<
 string,
 { icon: typeof Info; color: string; bgColor: string }
> = {
 debug: { icon: Bug, color: "text-muted-foreground", bgColor: "bg-muted/50" },
 info: { icon: Info, color: "text-primary", bgColor: "bg-primary/5" },
 warning: {
 icon: AlertTriangle,
 color: "text-foreground",
 bgColor: "bg-brand-gold",
 },
 error: { icon: AlertCircle, color: "text-white", bgColor: "bg-brand-burgundy" },
 critical: { icon: AlertCircle, color: "text-white", bgColor: "bg-brand-burgundy" },
};

function LogLevelBadge({ level }: { level: string }) {
 const config = LOG_LEVEL_CONFIG[level.toLowerCase()] || LOG_LEVEL_CONFIG.info;
 const Icon = config.icon;
 return (
 <span
 className={`inline-flex items-center gap-1 rounded-none border border-border px-1.5 py-0.5 text-[9px] font-semibold ${config.bgColor} ${config.color}`}
 >
 <Icon className="h-2.5 w-2.5" />
 {level}
 </span>
 );
}

export function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
 return (
 <div className="flex items-center gap-2 text-[10px] font-semibold">
 {isConnected ? (
 <>
 <div className="h-3 w-3 bg-brand-forest-green border border-border animate-pulse" />
 <span className="text-brand-forest-green">Connected</span>
 </>
 ) : (
 <>
 <div className="h-3 w-3 bg-muted border border-border" />
 <span className="text-muted-foreground">Offline</span>
 </>
 )}
 </div>
 );
}

function JobLogPanel({ jobId, logs }: { jobId: string; logs: LogEntry[] }) {
 const jobLogs = useMemo(
 () => logs.filter((l) => l.job_id === jobId),
 [jobId, logs]
 );

 if (jobLogs.length === 0) {
 return (
 <div className="px-2 py-4 text-xs text-muted-foreground font-semibold text-center border-t border-border bg-muted/10">
 No log entries yet — logs will stream in real time.
 </div>
 );
 }

 return (
 <div className="border-t border-border bg-muted/5">
 <ScrollArea className="max-h-64">
 <div className="divide-y divide-border/50">
 {jobLogs.map((log) => (
 <div
 key={log.id}
 className="flex items-start gap-2 px-2 py-1.5 text-xs hover:bg-muted/30 transition-colors"
 >
 <LogLevelBadge level={log.level} />
 <span className="flex-1 text-foreground font-mono break-all leading-relaxed">
 {log.message}
 </span>
 <span className="text-zinc-500 font-semibold tabular-nums shrink-0">
 {new Date(log.created_at ?? log.timestamp).toLocaleTimeString()}
 </span>
 </div>
 ))}
 </div>
 </ScrollArea>
 </div>
 );
}

export function toActiveJob(job: JobAssignment): ActiveJob {
 const liveProgress = progressUpdateFromJobRecord(job);

 return {
 id: job.id,
 jobType: null,
 officialBrandPhase: null,
 cohortId: null,
 skuCount: job.skus?.length ?? 0,
 scrapers: job.scrapers ?? [],
 status:
 job.status === "claimed"
 ? "running"
 : (job.status as ActiveJob["status"]),
 createdAt: job.created_at,
 completedAt: null,
 progress: liveProgress?.progress ?? 0,
 runnerName: job.runner_name ?? liveProgress?.runner_name ?? null,
 progressMessage: liveProgress?.message ?? null,
 progressPhase: liveProgress?.phase ?? null,
 currentSku: liveProgress?.current_sku ?? null,
 itemsProcessed: liveProgress?.items_processed ?? null,
 itemsTotal: liveProgress?.items_total ?? null,
 lastLogMessage: job.last_log_message ?? null,
 lastLogLevel: job.last_log_level ?? null,
 lastLogAt: job.last_log_at ?? null,
 lastUpdateAt:
 liveProgress?.timestamp ??
 job.last_event_at ??
 job.updated_at ??
 job.created_at,
 heartbeatAt: job.heartbeat_at ?? null,
 chunks: [],
 chunkSummary: { total: 0, pending: 0, running: 0, completed: 0, failed: 0 },
 };
}

function JobStatusBadge({ status }: { status: ActiveJob["status"] }) {
 const statusMap = {
 running: {
 className: "bg-primary/5 text-primary",
 icon: <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />,
 label: "Running",
 },
 completed: {
 className: "bg-brand-forest-green text-white",
 icon: <CheckCircle className="mr-1.5 h-3 w-3" />,
 label: "Completed",
 },
 failed: {
 className: "bg-brand-burgundy text-white",
 icon: <AlertCircle className="mr-1.5 h-3 w-3" />,
 label: "Failed",
 },
 cancelled: {
 className: "bg-muted text-muted-foreground",
 icon: <XCircle className="mr-1.5 h-3 w-3" />,
 label: "Cancelled",
 },
 pending: {
 className: "bg-brand-gold text-brand-burgundy",
 icon: <Clock className="mr-1.5 h-3 w-3" />,
 label: "Pending",
 },
 };

 const config = statusMap[status] || statusMap.pending;

 return (
 <span
 className={`inline-flex items-center rounded-none border border-border px-2 py-0.5 text-[10px] font-semibold ${config.className}`}
 >
 {config.icon}
 {config.label}
 </span>
 );
}

import { JobConsoleDrawer } from "../scraper-console/JobConsoleDrawer";
import { useState } from "react";

export function JobCard({
 job,
 logs,
 expandedPanel,
 onTogglePanel,
 onCancelClick,
 cancellingId,
 logCount,
}: {
 job: ActiveJob;
 logs: LogEntry[];
 expandedPanel: ExpandPanel | null;
 onTogglePanel: (panel: ExpandPanel) => void;
 onCancelClick: (jobId: string) => void;
 cancellingId: string | null;
 logCount: number;
}) {
 const [isConsoleOpen, setIsConsoleOpen] = useState(false);
 const hasChunks = job.chunkSummary.total > 0;
 const isActive = job.status === "pending" || job.status === "running";
 const reviewHref = job.cohortId
 ? `/admin/pipeline/official-brand?cohort_id=${encodeURIComponent(job.cohortId)}`
 : null;

 return (
 <div className="rounded-none border border-border bg-card overflow-hidden">
 <div className="p-4 sm:p-5">
 <div className="flex items-start justify-between">
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <h3 className="font-semibold text-foreground">
 Job {job.id.slice(0, 8)}
 </h3>
 <JobStatusBadge status={job.status} />
 </div>
 <p className="text-xs font-semibold text-muted-foreground mt-1">
 {job.scrapers.join(", ")}
 </p>
 <p className="text-[10px] font-semibold text-muted-foreground/60 mt-0.5">
 {job.skuCount} SKUs • Started{" "}
 {new Date(job.createdAt).toLocaleString()}
 {job.completedAt && (
 <> • Finished {new Date(job.completedAt).toLocaleString()}</>
 )}
 </p>
 {typeof job.itemsTotal === "number" ? (
 <p className="text-[10px] font-semibold text-muted-foreground/60 mt-0.5">
 {job.itemsTotal} Work Units
 {job.chunkSummary.total > 0 ? ` • ${job.chunkSummary.total} Chunks` : ""}
 </p>
 ) : null}
 <div className="mt-2 flex flex-wrap items-center gap-2">
 {job.runnerName ? (
 <span className="rounded-none border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-semibold">
 Runner: {job.runnerName}
 </span>
 ) : null}
 {job.progressPhase ? (
 <span className="rounded-none border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-semibold">
 {job.progressPhase}
 </span>
 ) : null}
 {job.currentSku ? (
 <span className="font-mono text-[10px] font-bold text-foreground bg-muted border border-border px-1.5 py-0.5">
 {job.currentSku}
 </span>
 ) : null}
 {typeof job.itemsProcessed === "number" &&
 typeof job.itemsTotal === "number" ? (
 <span className="text-[10px] font-semibold text-muted-foreground">
 {job.itemsProcessed}/{job.itemsTotal}
 </span>
 ) : null}
 </div>
 </div>
 </div>

 {/* Progress Section */}
 <div className="mt-2">
 <ProgressBar 
 progress={job.progress} 
 status={job.status} 
 className="mb-1"
 />
 
 {hasChunks && (
 <div className="flex items-center gap-2 mb-1">
 <ChunkSummaryLine summary={job.chunkSummary} />
 </div>
 )}

 {(job.progressMessage || job.lastLogMessage) && (
 <div className="mt-2 space-y-1">
 {job.progressMessage ? (
 <p className="text-xs font-bold text-foreground">
 {job.progressMessage}
 </p>
 ) : null}
 {job.lastLogMessage ? (
 <div className="flex items-center gap-2 text-muted-foreground">
 {job.lastLogLevel ? (
 <LogLevelBadge level={job.lastLogLevel} />
 ) : null}
 <span className="line-clamp-1 text-[11px] font-semibold opacity-80">
 {job.lastLogMessage}
 </span>
 {job.lastLogAt ? (
 <span className="shrink-0 tabular-nums text-[10px] font-semibold">
 {new Date(job.lastLogAt).toLocaleTimeString()}
 </span>
 ) : null}
 </div>
 ) : null}
 </div>
 )}
 </div>

 {/* Action Buttons */}
 <div className="mt-2 flex items-center justify-between pt-2 border-t border-border/50">
 <div className="flex items-center gap-2">
 {/* Chunks Toggle */}
 {hasChunks && (
 <Button
 variant="outline"
 size="sm"
 onClick={() => onTogglePanel("chunks")}
 className={`text-[10px] font-semibold h-7 gap-1.5 rounded-none ${expandedPanel === "chunks" ? "bg-muted" : ""}`}
 >
 <Layers className="h-3.5 w-3.5" />
 {job.chunkSummary.total} Chunks
 {expandedPanel === "chunks" ? (
 <ChevronUp className="h-3.5 w-3.5" />
 ) : (
 <ChevronDown className="h-3.5 w-3.5" />
 )}
 </Button>
 )}

 {/* Logs Toggle */}
 <Button
 variant="outline"
 size="sm"
 onClick={() => onTogglePanel("logs")}
 className={`text-[10px] font-semibold h-7 gap-1.5 rounded-none ${expandedPanel === "logs" ? "bg-muted" : ""}`}
 >
 Logs
 {logCount > 0 && (
 <Badge
 variant="secondary"
 className="ml-0.5 text-[9px] px-1.5 py-0 rounded-none border border-border"
 >
 {logCount}
 </Badge>
 )}
 {expandedPanel === "logs" ? (
 <ChevronUp className="h-3.5 w-3.5" />
 ) : (
 <ChevronDown className="h-3.5 w-3.5" />
 )}
 </Button>
 </div>

 <div className="flex items-center gap-2">
 {job.officialBrandPhase === "url_discovery" && reviewHref ? (
 <Button variant="outline" size="sm" asChild className="h-7 rounded-none text-[10px]">
 <Link href={reviewHref}>
 <ExternalLink className="h-3.5 w-3.5" />
 Review Candidates
 </Link>
 </Button>
 ) : null}
 {isActive && (
 <Button
 variant="outline"
 size="sm"
 onClick={() => setIsConsoleOpen(true)}
 className="h-7 rounded-none text-[10px] bg-zinc-900 text-white hover:bg-zinc-800"
 >
 <Terminal className="h-3.5 w-3.5 mr-1.5" />
 Console
 </Button>
 )}
 {isActive && (
 <Button
 variant="destructive"
 size="sm"
 onClick={() => onCancelClick(job.id)}
 disabled={cancellingId === job.id}
 className="h-7 w-7 p-0 rounded-none"
 >
 {cancellingId === job.id ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <XCircle className="h-3.5 w-3.5" />
 )}
 </Button>
 )}
 <Button variant="outline" size="sm" asChild className="h-7 w-7 p-0 rounded-none">
 <Link href={`/admin/scrapers/runs/${job.id}`}>
 <ExternalLink className="h-3.5 w-3.5" />
 </Link>
 </Button>
 </div>
 </div>
 </div>

 {/* Expandable Panels */}
 {expandedPanel === "chunks" && hasChunks && (
 <ChunkStatusTable chunks={job.chunks} />
 )}
 {expandedPanel === "logs" && <JobLogPanel jobId={job.id} logs={logs} />}

 <JobConsoleDrawer 
 jobId={job.id} 
 isOpen={isConsoleOpen} 
 onClose={() => setIsConsoleOpen(false)} 
 />
 </div>
 );
}
