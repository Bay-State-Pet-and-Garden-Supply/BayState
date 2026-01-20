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

interface ClaimChunkRequest {
    job_id: string;
    runner_name?: string;
}

interface ChunkResponse {
    chunk_id: string;
    chunk_index: number;
    skus: string[];
    scrapers: string[];
}

interface ClaimChunkResponse {
    chunk: ChunkResponse | null;
    message?: string;
    remaining_chunks?: number;
}

/**
 * DEPRECATED: Chunking removed in favor of split-job (Option A).
 * This route is kept for reference only and will be removed in a future update.
 * DO NOT USE - Runners should use direct job processing instead.
 *
 * Original function:
 * POST /api/scraper/v1/claim-chunk
 *
 * Atomically claimed the next pending chunk for a runner.
 * Used PostgreSQL's FOR UPDATE SKIP LOCKED to prevent race conditions.
 */
export async function POST(request: NextRequest) {
    try {
        // Validate authentication
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            console.error('[Claim Chunk] Authentication failed');
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body: ClaimChunkRequest = await request.json();
        const { job_id, runner_name } = body;

        if (!job_id) {
            return NextResponse.json(
                { error: 'Missing required field: job_id' },
                { status: 400 }
            );
        }

        // Use provided runner_name or fall back to authenticated runner name
        const claimingRunner = runner_name || runner.runnerName;
        const supabase = getSupabaseAdmin();

        // Call the atomic claim function
        const { data: claimedChunks, error: claimError } = await supabase.rpc('claim_next_chunk', {
            p_job_id: job_id,
            p_runner_name: claimingRunner,
        });

        if (claimError) {
            console.error('[Claim Chunk] RPC error:', claimError);
            return NextResponse.json(
                { error: 'Failed to claim chunk', details: claimError.message },
                { status: 500 }
            );
        }

        // Check if we got a chunk
        if (!claimedChunks || claimedChunks.length === 0) {
            // No pending chunks - check how many remain in other states
            const { count } = await supabase
                .from('scrape_job_chunks')
                .select('*', { count: 'exact', head: true })
                .eq('job_id', job_id)
                .in('status', ['claimed', 'running']);

            console.log(`[Claim Chunk] No pending chunks for job ${job_id}. ${count || 0} chunks in progress.`);

            const response: ClaimChunkResponse = {
                chunk: null,
                message: 'No pending chunks available',
                remaining_chunks: count || 0,
            };

            return NextResponse.json(response);
        }

        const chunk = claimedChunks[0];

        // Update chunk to running status
        await supabase
            .from('scrape_job_chunks')
            .update({ 
                status: 'running',
                started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', chunk.chunk_id);

        // Update runner status
        await supabase
            .from('scraper_runners')
            .update({
                status: 'busy',
                last_seen_at: new Date().toISOString(),
            })
            .eq('name', claimingRunner);

        console.log(`[Claim Chunk] Runner ${claimingRunner} claimed chunk ${chunk.chunk_index} (${chunk.skus?.length || 0} SKUs) for job ${job_id}`);

        const response: ClaimChunkResponse = {
            chunk: {
                chunk_id: chunk.chunk_id,
                chunk_index: chunk.chunk_index,
                skus: chunk.skus || [],
                scrapers: chunk.scrapers || [],
            },
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('[Claim Chunk] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
