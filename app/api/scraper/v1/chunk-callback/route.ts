import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
}

interface ChunkCallbackRequest {
    chunk_id: string;
    job_id?: string;
    status: 'completed' | 'failed';
    runner_name?: string;
    results?: {
        skus_processed?: number;
        skus_successful?: number;
        skus_failed?: number;
        data?: Record<string, unknown>;
    };
    error_message?: string;
}

export async function POST(request: NextRequest) {
    try {
        // Validate authentication
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            console.error('[Chunk Callback] Authentication failed');
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body: ChunkCallbackRequest = await request.json();
        const { chunk_id, status, results, error_message } = body;

        if (!chunk_id || !status) {
            return NextResponse.json(
                { error: 'Missing required fields: chunk_id, status' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();

        // Get chunk details first
        const { data: chunk, error: chunkError } = await supabase
            .from('scrape_job_chunks')
            .select('*, scrape_jobs(id, status)')
            .eq('id', chunk_id)
            .single();

        if (chunkError || !chunk) {
            console.error('[Chunk Callback] Chunk not found:', chunk_id);
            return NextResponse.json(
                { error: 'Chunk not found' },
                { status: 404 }
            );
        }

        // Update chunk status and results
        const updateData: Record<string, unknown> = {
            status,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        if (results) {
            updateData.results = results.data || {};
            updateData.skus_processed = results.skus_processed || 0;
            updateData.skus_successful = results.skus_successful || 0;
            updateData.skus_failed = results.skus_failed || 0;
        }

        if (error_message) {
            updateData.error_message = error_message;
        }

        const { error: updateError } = await supabase
            .from('scrape_job_chunks')
            .update(updateData)
            .eq('id', chunk_id);

        if (updateError) {
            console.error('[Chunk Callback] Update failed:', updateError);
            return NextResponse.json(
                { error: 'Failed to update chunk' },
                { status: 500 }
            );
        }

        console.log(`[Chunk Callback] Chunk ${chunk.chunk_index} for job ${chunk.job_id} marked as ${status}`);

        // Check if all chunks for this job are complete
        const jobId = chunk.job_id;
        const { data: chunkStats, error: statsError } = await supabase
            .from('scrape_job_chunks')
            .select('status')
            .eq('job_id', jobId);

        if (!statsError && chunkStats) {
            const totalChunks = chunkStats.length;
            const completedChunks = chunkStats.filter(c => c.status === 'completed').length;
            const failedChunks = chunkStats.filter(c => c.status === 'failed').length;
            const pendingOrRunning = chunkStats.filter(c => c.status === 'pending' || c.status === 'running').length;

            console.log(`[Chunk Callback] Job ${jobId} progress: ${completedChunks + failedChunks}/${totalChunks} chunks done (${pendingOrRunning} in progress)`);

            // If all chunks are complete (success or failure), update job status
            if (pendingOrRunning === 0) {
                const jobStatus = failedChunks > 0 && completedChunks === 0 ? 'failed' : 'completed';
                
                // Aggregate results from all chunks
                const { data: allChunks } = await supabase
                    .from('scrape_job_chunks')
                    .select('results, skus_processed, skus_successful, skus_failed')
                    .eq('job_id', jobId);

                const aggregatedResults = {
                    chunks_total: totalChunks,
                    chunks_completed: completedChunks,
                    chunks_failed: failedChunks,
                    skus_processed: allChunks?.reduce((sum, c) => sum + (c.skus_processed || 0), 0) || 0,
                    skus_successful: allChunks?.reduce((sum, c) => sum + (c.skus_successful || 0), 0) || 0,
                    skus_failed: allChunks?.reduce((sum, c) => sum + (c.skus_failed || 0), 0) || 0,
                };

                await supabase
                    .from('scrape_jobs')
                    .update({
                        status: jobStatus,
                        completed_at: new Date().toISOString(),
                    })
                    .eq('id', jobId);

                console.log(`[Chunk Callback] Job ${jobId} completed with status: ${jobStatus}`, aggregatedResults);
            }
        }

        // Update runner status to online (not busy)
        const runnerName = runner.runnerName;
        await supabase
            .from('scraper_runners')
            .update({
                status: 'online',
                last_seen_at: new Date().toISOString(),
            })
            .eq('name', runnerName);

        return NextResponse.json({
            success: true,
            chunk_id,
            status,
        });
    } catch (error) {
        console.error('[Chunk Callback] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
