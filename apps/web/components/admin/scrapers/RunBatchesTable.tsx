'use client';

import React from 'react';
import { format } from 'date-fns';
import { 
  Package, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  PlayCircle,
  ExternalLink,
  Search,
  Cpu
} from 'lucide-react';

import { ScraperRunChunk } from '@/lib/admin/scrapers/runs-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface RunBatchesTableProps {
  chunks: ScraperRunChunk[];
  selectedChunkId?: string | null;
  onSelectChunk: (chunkId: string | null) => void;
}

const statusConfig = {
  pending: { 
    label: 'PENDING', 
    icon: Clock, 
    color: 'bg-zinc-100 text-zinc-500 border-zinc-200',
    dot: 'bg-zinc-400'
  },
  running: { 
    label: 'RUNNING', 
    icon: PlayCircle, 
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    dot: 'bg-amber-500'
  },
  completed: { 
    label: 'COMPLETED', 
    icon: CheckCircle2, 
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500'
  },
  failed: { 
    label: 'FAILED', 
    icon: XCircle, 
    color: 'bg-red-100 text-red-700 border-red-200',
    dot: 'bg-red-500'
  },
};

export function RunBatchesTable({ chunks, selectedChunkId, onSelectChunk }: RunBatchesTableProps) {
  if (chunks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border-4 border-zinc-900 bg-zinc-50 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        <Package className="h-12 w-12 text-zinc-300 mb-4" />
        <h3 className="text-xl font-black uppercase tracking-tighter">No Batches Found</h3>
        <p className="text-zinc-500 font-medium mt-1">This run hasn&apos;t been split into chunks yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
          <Package className="h-6 w-6" />
          Execution Batches ({chunks.length})
        </h3>
        {selectedChunkId && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onSelectChunk(null)}
            className="border-2 border-zinc-900 font-bold uppercase tracking-tight shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
          >
            Clear Filter
          </Button>
        )}
      </div>

      <div className="overflow-x-auto border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] bg-white">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-4 border-zinc-900 bg-zinc-100">
              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-600 border-r-4 border-zinc-900">#</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-600 border-r-4 border-zinc-900">Status</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-600 border-r-4 border-zinc-900">Progress</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-600 border-r-4 border-zinc-900">Runner</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {chunks.map((chunk) => {
              const status = statusConfig[chunk.status] || statusConfig.pending;
              const StatusIcon = status.icon;
              const isSelected = selectedChunkId === chunk.id;
              const progress = chunk.planned_work_units > 0 
                ? Math.round((chunk.work_units_processed / chunk.planned_work_units) * 100)
                : 0;

              return (
                <tr 
                  key={chunk.id} 
                  className={`border-b-2 border-zinc-200 hover:bg-zinc-50 transition-colors ${isSelected ? 'bg-amber-50' : ''}`}
                >
                  <td className="px-4 py-4 border-r-4 border-zinc-900 font-mono font-bold text-zinc-900">
                    {chunk.chunk_index}
                  </td>
                  <td className="px-4 py-4 border-r-4 border-zinc-900">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${status.dot}`} />
                      <span className="font-black text-xs uppercase tracking-tight text-zinc-900">
                        {status.label}
                      </span>
                    </div>
                    {chunk.error_message && (
                      <p className="text-[10px] text-red-600 font-medium mt-1 max-w-[200px] truncate" title={chunk.error_message}>
                        {chunk.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 border-r-4 border-zinc-900">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                        <span>{chunk.work_units_processed} / {chunk.planned_work_units} SKUs</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress 
                        value={progress} 
                        className="h-2 border border-zinc-900 rounded-none bg-zinc-100" 
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4 border-r-4 border-zinc-900">
                    {chunk.claimed_by ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                          <Cpu className="h-3 w-3" />
                          {chunk.claimed_by}
                        </span>
                        {chunk.started_at && (
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {format(new Date(chunk.started_at), 'HH:mm:ss')}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400 font-medium italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => onSelectChunk(isSelected ? null : chunk.id)}
                      className={`h-8 w-full border-2 border-zinc-900 font-black uppercase tracking-tighter text-[10px] shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all ${
                        isSelected ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900'
                      }`}
                    >
                      <Search className="h-3 w-3 mr-1" />
                      {isSelected ? 'Filtering Logs' : 'View Logs'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border-4 border-zinc-900 bg-white p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Completed Batches</p>
          <p className="text-2xl font-black text-zinc-900">
            {chunks.filter(c => c.status === 'completed').length} / {chunks.length}
          </p>
        </div>
        <div className="border-4 border-zinc-900 bg-white p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Success Rate</p>
          <p className="text-2xl font-black text-zinc-900">
            {chunks.length > 0 
              ? Math.round((chunks.filter(c => c.status === 'completed').length / chunks.length) * 100) 
              : 0}%
          </p>
        </div>
        <div className="border-4 border-zinc-900 bg-white p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Failed Batches</p>
          <p className="text-2xl font-black text-red-600">
            {chunks.filter(c => c.status === 'failed').length}
          </p>
        </div>
      </div>
    </div>
  );
}
