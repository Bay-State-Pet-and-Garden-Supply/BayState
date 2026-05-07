'use client';

import React from 'react';
import { 
 Tooltip,
 TooltipContent,
 TooltipProvider,
 TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScraperRunChunk } from '@/lib/admin/scrapers/runs-types';
import { cn } from '@/lib/utils';

interface ChunkStatusGridProps {
 chunks: ScraperRunChunk[];
 selectedChunkId?: string | null;
 onSelectChunk: (chunkId: string | null) => void;
}

const statusColors = {
 pending: 'bg-muted border-border hover:bg-muted',
 running: 'bg-amber-400 border-amber-600 animate-pulse hover:bg-amber-500',
 completed: 'bg-emerald-500 border-emerald-700 hover:bg-emerald-600',
 failed: 'bg-red-500 border-red-700 hover:bg-red-600',
};

export function ChunkStatusGrid({ chunks, selectedChunkId, onSelectChunk }: ChunkStatusGridProps) {
 if (chunks.length === 0) return null;

 return (
 <TooltipProvider delayDuration={0}>
 <div className="flex flex-wrap gap-1.5 p-4 border border-border rounded-lg bg-card">
 {chunks.map((chunk) => {
 const isSelected = selectedChunkId === chunk.id;
 const status = chunk.status;
 const colorClass = statusColors[status as keyof typeof statusColors] || statusColors.pending;

 return (
 <Tooltip key={chunk.id}>
 <TooltipTrigger asChild>
 <button
 onClick={() => onSelectChunk(isSelected ? null : chunk.id)}
 className={cn(
 "h-6 w-6 border-2 transition-all cursor-pointer",
 colorClass,
 isSelected ? "ring-4 ring-zinc-900 ring-offset-2 scale-110 z-10" : "hover:scale-110"
 )}
 aria-label={`Chunk ${chunk.chunk_index}: ${status}`}
 />
 </TooltipTrigger>
 <TooltipContent side="top" className="rounded-none border-2 border-border bg-card p-2">
 <div className="text-[10px] font-semibold space-y-1">
 <p className="text-foreground">Batch #{chunk.chunk_index}</p>
 <p className={cn(
 "px-1 py-0.5 inline-block",
 status === 'completed' ? "bg-emerald-100 text-emerald-800" :
 status === 'failed' ? "bg-red-100 text-red-800" :
 status === 'running' ? "bg-amber-100 text-amber-800" :
 "bg-muted text-zinc-800"
 )}>
 {status.toUpperCase()}
 </p>
 <p className="text-zinc-500">{chunk.work_units_processed} / {chunk.planned_work_units} SKUs</p>
 {chunk.claimed_by && <p className="text-zinc-400">Runner: {chunk.claimed_by}</p>}
 </div>
 </TooltipContent>
 </Tooltip>
 );
 })}
 </div>
 </TooltipProvider>
 );
}
