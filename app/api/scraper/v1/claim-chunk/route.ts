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
    job_id?: string;
    runner_name?: string;
}

interface ChunkResponse {
    chunk_id: string;
    job_id: string;
    chunk_index: number;
    skus: string[];
    scrapers: string[];
    test_mode: boolean;
    max_workers: number;
    lease_token?: string;
    lease_expires_at?: string;
}

interface ClaimChunkResponse {
    chunk: ChunkResponse | null;
    message?: string;
    remaining_chunks?: number;
}

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
        const { runner_name } = body;

        // Use provided runner_name or fall back to authenticated runner name
        const claimingRunner = runner_name || runner.runnerName;
        const supabase = getSupabaseAdmin();

        // Call the atomic claim function
        const { data: claimedChunks, error: claimError } = await supabase.rpc('claim_next_pending_chunk', {
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
                .in('status', ['pending', 'running']);

            console.log(`[Claim Chunk] No pending chunks available. ${count || 0} chunks pending/running.`);

            const response: ClaimChunkResponse = {
                chunk: null,
                message: 'No pending chunks available',
                remaining_chunks: count || 0,
            };

            return NextResponse.json(response);
        }

        const chunk = claimedChunks[0];

        // Update runner status
        await supabase
            .from('scraper_runners')
            .update({
                status: 'busy',
                last_seen_at: new Date().toISOString(),
            })
            .eq('name', claimingRunner);

        console.log(`[Claim Chunk] Runner ${claimingRunner} claimed chunk ${chunk.chunk_index} (${chunk.skus?.length || 0} SKUs) for job ${chunk.job_id}`);

        const response: ClaimChunkResponse = {
            chunk: {
                chunk_id: chunk.chunk_id,
                job_id: chunk.job_id,
                chunk_index: chunk.chunk_index,
                skus: chunk.skus || [],
                scrapers: chunk.scrapers || [],
                test_mode: chunk.test_mode || false,
                max_workers: chunk.max_workers || 3,
                lease_token: chunk.lease_token || undefined,
                lease_expires_at: chunk.lease_expires_at || undefined,
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
