'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, AlertCircle, CheckCircle2, Clock, User, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ScrapeJobChunk } from '@/types/scraper';

interface ChunkMatrixProps {
    jobId: string;
    className?: string;
}

type ChunkStatus = 'pending' | 'active' | 'done' | 'failed';

interface ChunkWithStatus extends ScrapeJobChunk {
    status: ChunkStatus;
    runnerName?: string;
    retryCount?: number;
    error?: string;
}

const STATUS_CONFIG: Record<ChunkStatus, { label: string; color: string; bgColor: string }> = {
    pending: { label: 'Pending', color: 'text-gray-600', bgColor: 'bg-gray-200 hover:bg-gray-300' },
    active: { label: 'Active', color: 'text-blue-700', bgColor: 'bg-blue-200 hover:bg-blue-300' },
    done: { label: 'Done', color: 'text-green-700', bgColor: 'bg-green-200 hover:bg-green-300' },
    failed: { label: 'Failed', color: 'text-red-700', bgColor: 'bg-red-200 hover:bg-red-300' },
};

function getChunkStatus(chunk: ScrapeJobChunk): ChunkStatus {
    // Check if there's an active lease
    if (chunk.lease_token && chunk.lease_expires_at) {
        const expiresAt = new Date(chunk.lease_expires_at);
        if (expiresAt > new Date()) {
            return 'active';
        }
    }
    // Default to pending if no lease - we'll update to done/failed after checking results
    return 'pending';
}

export function ChunkMatrix({ jobId, className }: ChunkMatrixProps) {
    const [chunks, setChunks] = useState<ChunkWithStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedChunk, setSelectedChunk] = useState<ChunkWithStatus | null>(null);
    const supabase = createClient();

    useEffect(() => {
        async function fetchChunks() {
            try {
                // Fetch all chunks for this job
                const { data: chunkData, error: chunkError } = await supabase
                    .from('scrape_job_chunks')
                    .select('*')
                    .eq('job_id', jobId)
                    .order('chunk_index', { ascending: true });

                if (chunkError) throw chunkError;

                if (!chunkData || chunkData.length === 0) {
                    setChunks([]);
                    setLoading(false);
                    return;
                }

                // Fetch results to determine done status
                const { data: resultData } = await supabase
                    .from('scrape_results')
                    .select('chunk_index')
                    .eq('job_id', jobId);

                const doneIndices = new Set(resultData?.map(r => r.chunk_index) || []);

                // Fetch error events to determine failed status
                const { data: errorData } = await supabase
                    .from('scraper_events')
                    .select('data')
                    .eq('job_id', jobId)
                    .eq('severity', 'ERROR')
                    .contains('data', { chunk_index: chunkData.map(c => c.chunk_index) });

                const errorChunks = new Set<number>();
                errorData?.forEach(event => {
                    if (event.data?.chunk_index !== undefined) {
                        errorChunks.add(event.data.chunk_index);
                    }
                });

                // Build chunks with status
                const chunksWithStatus: ChunkWithStatus[] = chunkData.map(chunk => {
                    const status = errorChunks.has(chunk.chunk_index) 
                        ? 'failed' 
                        : doneIndices.has(chunk.chunk_index) 
                            ? 'done' 
                            : getChunkStatus(chunk);

                    return {
                        ...chunk,
                        status,
                        runnerName: chunk.lease_token ? 'Runner' : undefined, // Would need runner lookup
                    };
                });

                setChunks(chunksWithStatus);
            } catch (err) {
                console.error('Error fetching chunks:', err);
            } finally {
                setLoading(false);
            }
        }

        if (jobId) {
            fetchChunks();
        }
    }, [jobId, supabase]);

    if (loading) {
        return (
            <Card className={className}>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Chunk Matrix</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-6 gap-2">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    const statusCounts = chunks.reduce((acc, chunk) => {
        acc[chunk.status] = (acc[chunk.status] || 0) + 1;
        return acc;
    }, {} as Record<ChunkStatus, number>);

    return (
        <Card className={className}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Chunk Matrix</CardTitle>
                    <div className="flex gap-2">
                        {(Object.keys(STATUS_CONFIG) as ChunkStatus[]).map(status => (
                            <div key={status} className="flex items-center gap-1 text-xs">
                                <div className={`w-3 h-3 rounded ${STATUS_CONFIG[status].bgColor}`} />
                                <span className="text-muted-foreground">
                                    {statusCounts[status] || 0}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {chunks.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-8">
                        No chunks available for this job
                    </p>
                ) : (
                    <div className="space-y-4">
                        {/* Chunk Grid */}
                        <TooltipProvider>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                                {chunks.map(chunk => (
                                    <Tooltip key={chunk.chunk_id}>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={() => setSelectedChunk(chunk)}
                                                className={`
                                                    aspect-square rounded-md flex items-center justify-center text-sm font-medium
                                                    transition-all duration-200 cursor-pointer
                                                    ${STATUS_CONFIG[chunk.status].bgColor}
                                                    ${STATUS_CONFIG[chunk.status].color}
                                                    hover:scale-105 hover:shadow-md
                                                `}
                                            >
                                                {chunk.chunk_index + 1}
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <div className="text-xs space-y-1">
                                                <p className="font-medium">Chunk {chunk.chunk_index + 1}</p>
                                                <p>{STATUS_CONFIG[chunk.status].label}</p>
                                                <p className="text-muted-foreground">
                                                    {chunk.skus.length} SKUs
                                                </p>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
                        </TooltipProvider>

                        {/* Selected Chunk Details */}
                        {selectedChunk && (
                            <div className="mt-4 p-4 bg-muted/50 rounded-lg border">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-medium flex items-center gap-2">
                                        Chunk {selectedChunk.chunk_index + 1} Details
                                    </h4>
                                    <Badge 
                                        className={`${STATUS_CONFIG[selectedChunk.status].bgColor} ${STATUS_CONFIG[selectedChunk.status].color}`}
                                    >
                                        {STATUS_CONFIG[selectedChunk.status].label}
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Assigned Runner:</span>
                                        <span className="font-medium">
                                            {selectedChunk.lease_token ? 'Active Runner' : 'None'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <RefreshCw className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Retry Count:</span>
                                        <span className="font-medium">{selectedChunk.retryCount || 0}</span>
                                    </div>
                                    <div className="col-span-2 flex items-start gap-2">
                                        {selectedChunk.status === 'failed' ? (
                                            <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                                        ) : selectedChunk.status === 'done' ? (
                                            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                                        ) : (
                                            <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                                        )}
                                        <span className="text-muted-foreground">Status:</span>
                                        <span className={`font-medium ${
                                            selectedChunk.status === 'failed' ? 'text-destructive' :
                                            selectedChunk.status === 'done' ? 'text-green-600' : ''
                                        }`}>
                                            {selectedChunk.error || 'No errors'}
                                        </span>
                                    </div>
                                    <div className="col-span-2 pt-2 border-t">
                                        <p className="text-muted-foreground text-xs">
                                            <span className="font-medium">SKUs:</span> {selectedChunk.skus.join(', ')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
