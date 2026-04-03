import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import {
    getAIScrapingDefaults,
    getAIScrapingRuntimeCredentials,
} from '@/lib/ai-scraping/credentials';
import {
    buildRunnerBuildHeaders,
    buildRunnerBuildMetadata,
    createRunnerBuildMismatchResponse,
    getRunnerBuildCheck,
    loadExpectedRunnerRelease,
} from '@/lib/scraper-runner-version';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.SUPABASE_URL;
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
    job_type?: string;
    job_config?: Record<string, unknown>;
    ai_credentials?: {
        llm_provider?: 'openai' | 'openai_compatible';
        llm_model?: string;
        llm_base_url?: string;
        llm_api_key?: string;
        openai_api_key?: string;
        openai_compatible_api_key?: string;
        serpapi_api_key?: string;
        brave_api_key?: string;
    };
    lease_token?: string;
    lease_expires_at?: string;
}

interface ClaimChunkResponse {
    chunk: ChunkResponse | null;
    message?: string;
    remaining_chunks?: number;
}

interface RunnerRecord {
    name: string;
    enabled: boolean;
    status: string | null;
    metadata: Record<string, unknown> | null;
}

const DISCOVERY_CONFIG_KEYS = new Set([
    'product_name',
    'brand',
    'max_search_results',
    'max_steps',
    'confidence_threshold',
    'llm_provider',
    'llm_model',
    'llm_base_url',
    'search_provider',
    'prefer_manufacturer',
    'fallback_to_static',
    'max_concurrency',
]);

function hasKnownConfigKeys(
    config: Record<string, unknown> | undefined,
    keys: Set<string>
): boolean {
    if (!config) {
        return false;
    }

    return Object.keys(config).some((key) => keys.has(key));
}

function pickNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeDiscoveryConfig(
    config: Record<string, unknown>,
    defaults: {
        max_search_results: number;
        max_steps: number;
        confidence_threshold: number;
        llm_provider: 'openai' | 'openai_compatible';
        llm_model: string;
        llm_base_url: string | null;
    }
): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};

    if (typeof config.product_name === 'string') {
        normalized.product_name = config.product_name;
    }
    if (typeof config.brand === 'string') {
        normalized.brand = config.brand;
    }
    if (typeof config.prefer_manufacturer === 'boolean') {
        normalized.prefer_manufacturer = config.prefer_manufacturer;
    }
    if (typeof config.fallback_to_static === 'boolean') {
        normalized.fallback_to_static = config.fallback_to_static;
    }

    normalized.max_search_results = pickNumber(config.max_search_results, defaults.max_search_results);
    normalized.max_steps = pickNumber(config.max_steps, defaults.max_steps);
    normalized.confidence_threshold = pickNumber(config.confidence_threshold, defaults.confidence_threshold);

    const llmProvider =
        config.llm_provider === 'openai_compatible' ? 'openai_compatible' : defaults.llm_provider;
    const llmModel =
        typeof config.llm_model === 'string' && config.llm_model.trim().length > 0
            ? config.llm_model.trim()
            : defaults.llm_model;
    const llmBaseUrl =
        llmProvider === 'openai_compatible'
            ? typeof config.llm_base_url === 'string' && config.llm_base_url.trim().length > 0
                ? config.llm_base_url.trim()
                : defaults.llm_base_url
            : null;

    normalized.llm_provider = llmProvider;
    normalized.llm_model = llmModel;
    if (llmBaseUrl) {
        normalized.llm_base_url = llmBaseUrl;
    }

    return normalized;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    return undefined;
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
        const nowIso = new Date().toISOString();
        const expectedRelease = await loadExpectedRunnerRelease(supabase, request.headers);
        const versionCheck = getRunnerBuildCheck(request.headers, expectedRelease);
        const responseHeaders = buildRunnerBuildHeaders(versionCheck);

        const { data: runnerRows, error: runnerLookupError } = await supabase
            .from('scraper_runners')
            .update({ last_seen_at: nowIso })
            .eq('name', claimingRunner)
            .select('name, enabled, status, metadata');

        if (runnerLookupError) {
            console.error('[Claim Chunk] Failed to load runner state:', runnerLookupError);
            return NextResponse.json(
                { error: 'Failed to validate runner state', details: runnerLookupError.message },
                { status: 500 }
            );
        }

        if (!runnerRows || runnerRows.length === 0) {
            const response: ClaimChunkResponse = {
                chunk: null,
                message: 'Runner is disabled or paused',
            };

            return NextResponse.json(response, {
                headers: responseHeaders,
            });
        }

        const runnerRecord = runnerRows[0] as RunnerRecord;
        const versionMetadata = buildRunnerBuildMetadata(
            runnerRecord.metadata,
            versionCheck,
            nowIso
        );

        const updateRunnerState = async (updates: Record<string, unknown>) => {
            const { error } = await supabase
                .from('scraper_runners')
                .update({
                    metadata: versionMetadata,
                    ...updates,
                })
                .eq('name', claimingRunner);

            if (error) {
                console.error('[Claim Chunk] Failed to persist runner version state:', error);
            }
        };

        if (!versionCheck.isCompatible) {
            await updateRunnerState({});
            return createRunnerBuildMismatchResponse(versionCheck, {
                'X-Enforced-Runner-Name': claimingRunner,
            });
        }

        if (!runnerRecord.enabled || runnerRecord.status === 'paused') {
            await updateRunnerState({});

            const response: ClaimChunkResponse = {
                chunk: null,
                message: 'Runner is disabled or paused',
            };

            return NextResponse.json(response, {
                headers: responseHeaders,
            });
        }

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

            await updateRunnerState({});

            return NextResponse.json(response, {
                headers: responseHeaders,
            });
        }

        const chunk = claimedChunks[0];
        
        // Fetch AI credentials and defaults
        const [aiDefaults, aiCredentials] = await Promise.all([
            getAIScrapingDefaults(),
            getAIScrapingRuntimeCredentials(),
        ]);

        // Update runner status
        await supabase
            .from('scraper_runners')
            .update({
                status: 'busy',
                last_seen_at: nowIso,
                current_job_id: chunk.job_id,
                metadata: versionMetadata,
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
                job_type: chunk.type || 'standard',
                job_config: chunk.config || undefined,
                ai_credentials: aiCredentials || undefined,
                lease_token: chunk.lease_token || undefined,
                lease_expires_at: chunk.lease_expires_at || undefined,
            },
        };

        if (response.chunk) {
            const rawConfig = toRecord(chunk.config) || {};
            const isDiscovery =
                chunk.type === 'discovery'
                || response.chunk.scrapers.includes('ai_discovery')
                || hasKnownConfigKeys(rawConfig, DISCOVERY_CONFIG_KEYS);

            if (isDiscovery) {
                const sanitizedDiscoveryConfig = sanitizeDiscoveryConfig(rawConfig, aiDefaults);
                const maxSearchResults = pickNumber(sanitizedDiscoveryConfig.max_search_results, aiDefaults.max_search_results);
                const maxSteps = pickNumber(sanitizedDiscoveryConfig.max_steps, aiDefaults.max_steps);
                const confidenceThreshold = pickNumber(sanitizedDiscoveryConfig.confidence_threshold, aiDefaults.confidence_threshold);
                const llmProvider =
                    sanitizedDiscoveryConfig.llm_provider === 'openai_compatible'
                        ? 'openai_compatible'
                        : aiDefaults.llm_provider;
                const llmModel =
                    typeof sanitizedDiscoveryConfig.llm_model === 'string' && sanitizedDiscoveryConfig.llm_model.length > 0
                        ? sanitizedDiscoveryConfig.llm_model
                        : aiDefaults.llm_model;
                const llmBaseUrl =
                    typeof sanitizedDiscoveryConfig.llm_base_url === 'string' && sanitizedDiscoveryConfig.llm_base_url.length > 0
                        ? sanitizedDiscoveryConfig.llm_base_url
                        : aiDefaults.llm_base_url;

                response.chunk.job_config = {
                    ...sanitizedDiscoveryConfig,
                    max_search_results: maxSearchResults,
                    max_steps: maxSteps,
                    confidence_threshold: confidenceThreshold,
                    llm_provider: llmProvider,
                    llm_model: llmModel,
                    ...(llmBaseUrl ? { llm_base_url: llmBaseUrl } : {}),
                };
            }
        }

        return NextResponse.json(response, {
            headers: responseHeaders,
        });
    } catch (error) {
        console.error('[Claim Chunk] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
