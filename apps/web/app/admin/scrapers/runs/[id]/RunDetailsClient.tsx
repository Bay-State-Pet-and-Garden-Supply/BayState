'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Package,
  Boxes,
  Activity,
  BarChart3,
  Server,
  Zap
} from 'lucide-react';

import { ScraperRunRecord, ScraperRunChunk } from '@/lib/admin/scrapers/runs-types';
import { type ScrapeJobLogEntry as ScrapeJobLog } from '@/lib/scraper-logs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { LogViewer } from '@/components/admin/scrapers/LogViewer';
import { RunBatchesTable } from '@/components/admin/scrapers/RunBatchesTable';
import { progressUpdateFromJobRecord } from '@/lib/scraper-logs';

interface RunDetailsClientProps {
  run: ScraperRunRecord;
  logs: ScrapeJobLog[];
  chunks: ScraperRunChunk[];
}

const statusConfig = {
  pending: { label: 'PENDING', variant: 'secondary' as const, icon: Clock, color: 'text-zinc-500' },
  claimed: { label: 'CLAIMED', variant: 'secondary' as const, icon: Loader2, color: 'text-blue-500' },
  running: { label: 'RUNNING', variant: 'default' as const, icon: Loader2, color: 'text-amber-500' },
  completed: { label: 'COMPLETED', variant: 'default' as const, icon: CheckCircle2, color: 'text-emerald-500' },
  failed: { label: 'FAILED', variant: 'destructive' as const, icon: AlertCircle, color: 'text-red-500' },
  cancelled: { label: 'CANCELLED', variant: 'secondary' as const, icon: XCircle, color: 'text-zinc-500' },
} as const;

function formatDuration(createdAt: string, completedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));

  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function RunDetailsClient({ run, logs, chunks }: RunDetailsClientProps) {
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);

  const status = run.status.toLowerCase();
  const config = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.pending;
  const StatusIcon = config.icon;
  const initialProgress = progressUpdateFromJobRecord(run);

  const completedChunks = chunks.filter(c => c.status === 'completed').length;
  const totalChunks = chunks.length;
  const chunkProgress = totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 0;

  return (
    <div className="space-y-8 p-6 max-w-[1600px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between border-b-8 border-zinc-900 pb-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-zinc-500">
            <Link href="/admin/scrapers/runs" className="hover:text-zinc-900 transition-colors">
              Scraper Runs
            </Link>
            <span className="text-zinc-300">/</span>
            <span className="font-mono bg-zinc-100 px-2 py-0.5 border-2 border-zinc-900 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              {run.id.slice(0, 8)}
            </span>
          </div>
          <div className="space-y-1">
            <h1 className="text-6xl font-black uppercase tracking-tighter text-zinc-900 leading-none">
              Run <span className="text-[#66161D]">Details</span>
            </h1>
            <p className="text-lg font-bold text-zinc-500 uppercase tracking-tight">
              Monitoring Scrape Job Execution & Batch Progress
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <Button 
            variant="outline" 
            asChild 
            className="border-4 border-zinc-900 font-black uppercase tracking-tighter shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
          >
            <Link href="/admin/scrapers/runs">
              <ArrowLeft className="mr-2 h-5 w-5" />
              Back to Fleet
            </Link>
          </Button>
        </div>
      </div>

      {/* Overview Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Status Card */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-4 border-zinc-900 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] bg-white overflow-hidden">
            <div className={`h-4 ${config.color.replace('text', 'bg')}`} />
            <CardHeader className="border-b-4 border-zinc-900 bg-zinc-50">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3 text-2xl font-black uppercase tracking-tighter">
                  <Activity className="h-6 w-6" />
                  Execution Status
                </CardTitle>
                <Badge className={`px-4 py-1 text-sm font-black uppercase tracking-widest border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] ${config.variant === 'destructive' ? 'bg-red-600' : 'bg-zinc-900'} text-white rounded-none`}>
                  <StatusIcon className={`mr-2 h-4 w-4 ${status === 'running' || status === 'claimed' ? 'animate-spin' : ''}`} />
                  {config.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 border-b-4 border-zinc-900">
                <div className="p-6 border-r-4 border-zinc-900 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Scraper Source</p>
                  <p className="text-2xl font-black uppercase tracking-tighter text-zinc-900">{run.scraper_name}</p>
                </div>
                <div className="p-6 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Active Runner</p>
                  <p className="text-2xl font-black uppercase tracking-tighter text-zinc-900">{run.runner_name || 'PENDING ASSIGNMENT'}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3">
                <div className="p-6 border-r-4 border-zinc-900 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Started At</p>
                  <p className="text-sm font-bold text-zinc-900">{format(new Date(run.created_at), 'MMM d, h:mm:ss a')}</p>
                </div>
                <div className="p-6 border-r-4 border-zinc-900 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Duration</p>
                  <p className="text-sm font-bold text-zinc-900">{formatDuration(run.created_at, run.completed_at)}</p>
                </div>
                <div className="p-6 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Job ID</p>
                  <p className="text-xs font-mono font-bold text-zinc-400 break-all">{run.id}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progress Section */}
          <Card className="border-4 border-zinc-900 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] bg-white">
            <CardHeader className="border-b-4 border-zinc-900 bg-zinc-50 py-4">
              <CardTitle className="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Fleet Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Batch Completion</p>
                    <p className="text-3xl font-black text-zinc-900">{completedChunks} / {totalChunks} <span className="text-zinc-400 text-lg uppercase tracking-tighter">Chunks</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-black text-zinc-900">{chunkProgress}%</p>
                  </div>
                </div>
                <Progress 
                  value={chunkProgress} 
                  className="h-6 border-4 border-zinc-900 rounded-none bg-zinc-100" 
                />
              </div>

              <div className="bg-zinc-900 p-4 border-2 border-zinc-900">
                <div className="flex items-center gap-3 text-zinc-100">
                  <Zap className="h-5 w-5 text-amber-400 fill-amber-400" />
                  <div className="flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Active Phase</p>
                    <p className="text-sm font-bold uppercase tracking-tight">
                      {initialProgress?.phase || run.progress_phase || 'Awaiting Signal...'}
                      {initialProgress?.current_sku ? ` • Processing SKU: ${initialProgress.current_sku}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Metrics */}
        <div className="lg:col-span-4 space-y-6">
          <div className="border-4 border-zinc-900 bg-[#66161D] text-white p-6 shadow-[8px_8px_0px_rgba(0,0,0,1)] space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-300">Total Work Units</p>
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-red-400" />
              <p className="text-5xl font-black tracking-tighter">{run.total_skus}</p>
            </div>
          </div>

          <div className="border-4 border-zinc-900 bg-emerald-600 text-white p-6 shadow-[8px_8px_0px_rgba(0,0,0,1)] space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Items Discovered</p>
            <div className="flex items-center gap-3">
              <Boxes className="h-8 w-8 text-emerald-300" />
              <p className="text-5xl font-black tracking-tighter">{run.items_found}</p>
            </div>
          </div>

          <Card className="border-4 border-zinc-900 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] bg-white h-fit">
            <CardHeader className="border-b-4 border-zinc-900 bg-zinc-50 py-4">
              <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Server className="h-4 w-4" />
                Infrastructure
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Lease Status</p>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${run.lease_expires_at && new Date(run.lease_expires_at) > new Date() ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <p className="text-sm font-bold text-zinc-900 uppercase">
                    {run.lease_expires_at && new Date(run.lease_expires_at) > new Date() ? 'Active Lease' : 'Lease Expired'}
                  </p>
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t-2 border-zinc-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Heartbeat</p>
                <p className="text-sm font-bold text-zinc-900">
                  {run.heartbeat_at ? format(new Date(run.heartbeat_at), 'h:mm:ss a') : 'N/A'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Error Message if any */}
      {run.error_message && (
        <div className="border-4 border-red-600 bg-red-50 p-6 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex gap-4 items-start">
          <AlertCircle className="h-8 w-8 text-red-600 shrink-0" />
          <div className="space-y-1">
            <h3 className="text-xl font-black uppercase tracking-tighter text-red-700 leading-none">Job Error Termination</h3>
            <p className="text-red-900 font-mono text-sm font-bold bg-white/50 p-2 border border-red-200 mt-2">{run.error_message}</p>
          </div>
        </div>
      )}

      {/* Batches Section */}
      <RunBatchesTable 
        chunks={chunks} 
        selectedChunkId={selectedChunkId}
        onSelectChunk={setSelectedChunkId}
      />

      {/* Logs Section */}
      <div className="pt-4">
        <LogViewer 
          jobId={run.id} 
          logs={logs} 
          initialProgress={initialProgress} 
          selectedChunkId={selectedChunkId}
          onSelectChunk={setSelectedChunkId}
          chunks={chunks.map(c => ({ id: c.id, chunk_index: c.chunk_index }))}
          className="border-4 border-zinc-900 shadow-[12px_12px_0px_rgba(0,0,0,1)] bg-white rounded-none overflow-hidden"
        />
      </div>
    </div>
  );
}
