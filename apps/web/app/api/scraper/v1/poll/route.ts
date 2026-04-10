import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';
import {
    type AIScrapingRuntimeCredentials,
    getAIScrapingDefaults,
    getAIScrapingRuntimeCredentials,
} from '@/lib/ai-scraping/credentials';
import {
    CRAWL4AI_CONFIG_KEYS,
    DISCOVERY_CONFIG_KEYS,
    hasKnownConfigKeys,
    normalizeDiscoveryLLMProvider,
    pickNumber,
    sanitizeDiscoveryConfig,
} from '@/lib/ai-scraping/discovery-config';
import { getGeminiFeatureFlags, type GeminiFeatureFlags } from '@/lib/config/gemini-feature-flags';
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

interface ScraperConfig {
    name: string;
    disabled: boolean;
    base_url?: string;
    search_url_template?: string;
    selectors?: Record<string, unknown> | Record<string, unknown>[];
    options?: Record<string, unknown>;
    test_skus?: string[];
    retries?: number;
    validation?: Record<string, unknown>;
    login?: Record<string, unknown>;
    credential_refs?: string[];
}

interface PollResponse {
    job: {
        job_id: string;
        skus: string[];
        scrapers: ScraperConfig[];
        test_mode: boolean;
        max_workers: number;
        job_type?: string;
        job_config?: Record<string, unknown>;
        ai_credentials?: AIScrapingRuntimeCredentials;
        feature_flags?: GeminiFeatureFlags;
        lease_token?: string;
        lease_expires_at?: string;
    } | null;
}

interface RunnerRecord {
    name: string;
    enabled: boolean;
    status: string | null;
    metadata: Record<string, unknown> | null;
}

function deriveRequestedScrapers(job: {
    type?: string | null;
    scrapers?: string[] | null;
    config?: unknown;
}): string[] {
    if (Array.isArray(job.scrapers) && job.scrapers.length > 0) {
        return job.scrapers;
    }

    if (job.type === 'discovery') {
        return ['ai_discovery'];
    }

    if (job.type === 'crawl4ai') {
        return ['crawl4ai_discovery'];
    }

    const config = toRecord(job.config);
    if (hasKnownConfigKeys(config, DISCOVERY_CONFIG_KEYS)) {
        return ['ai_discovery'];
    }

    if (hasKnownConfigKeys(config, CRAWL4AI_CONFIG_KEYS)) {
        return ['crawl4ai_discovery'];
    }

    return [];
}

function normalizeRunnerJobType(rawType: unknown): 'standard' | 'ai_search' {
    if (rawType === 'ai_search' || rawType === 'discovery' || rawType === 'crawl4ai') {
        return 'ai_search';
    }

    return 'standard';
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return undefined;
}

function toSelectors(value: unknown): Record<string, unknown> | Record<string, unknown>[] | undefined {
    if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item));
    }

    if (value && typeof value === 'object') {
        return value as Record<string, unknown>;
    }

    return undefined;
}

export async function POST(request: NextRequest) {
    try {
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const runnerName = runner.runnerName;
        const supabase = getSupabaseAdmin();
        const nowIso = new Date().toISOString();
        const expectedRelease = await loadExpectedRunnerRelease(supabase, request.headers);
        const versionCheck = getRunnerBuildCheck(request.headers, expectedRelease);
        const responseHeaders = {
            'X-Enforced-Runner-Name': runnerName,
            ...buildRunnerBuildHeaders(versionCheck),
        };

        const { data: runnerRows, error: runnerLookupError } = await supabase
            .from('scraper_runners')
            .update({ last_seen_at: nowIso })
            .eq('name', runnerName)
            .select('name, enabled, status, metadata');

        if (runnerLookupError) {
            console.error('[Poll] Failed to load runner state:', runnerLookupError);
            return NextResponse.json(
                { error: 'Failed to load runner state', details: runnerLookupError.message },
                { status: 500 }
            );
        }

        if (!runnerRows || runnerRows.length === 0) {
            const response: PollResponse = { job: null };
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

        const updateRunnerMetadata = async (updates: Record<string, unknown>) => {
            const { error } = await supabase
                .from('scraper_runners')
                .update({
                    metadata: versionMetadata,
                    ...updates,
                })
                .eq('name', runnerName);

            if (error) {
                console.error('[Poll] Failed to persist runner version state:', error);
            }
        };

        if (!versionCheck.isCompatible) {
            await updateRunnerMetadata({ enabled: false, status: 'offline' });
            return createRunnerBuildMismatchResponse(versionCheck, {
                'X-Enforced-Runner-Name': runnerName,
            });
        }

        if (!runnerRecord.enabled || runnerRecord.status === 'paused') {
            await updateRunnerMetadata({});

            const response: PollResponse = { job: null };
            return NextResponse.json(response, {
                headers: responseHeaders,
            });
        }

        const { error: runnerUpdateError } = await supabase
            .from('scraper_runners')
            .update({
                status: 'polling',
                metadata: versionMetadata,
            })
            .eq('name', runnerName);

        if (runnerUpdateError) {
            console.error('[Poll] Failed to update runner polling state:', runnerUpdateError);
            return NextResponse.json(
                { error: 'Failed to update runner state', details: runnerUpdateError.message },
                { status: 500 }
            );
        }

        const { data: claimedJobs, error: claimError } = await supabase.rpc('claim_next_pending_job', {
            p_runner_name: runnerName,
        });

        if (claimError) {
            console.error('[Poll] RPC error:', claimError);
            return NextResponse.json(
                { error: 'Failed to poll for jobs', details: claimError.message },
                { status: 500 }
            );
        }

        if (!claimedJobs || claimedJobs.length === 0) {
            const response: PollResponse = { job: null };
            return NextResponse.json(response, {
                headers: responseHeaders,
            });
        }

        const job = claimedJobs[0];

        const requestedScrapers = deriveRequestedScrapers(job);
        const normalizedJobType = normalizeRunnerJobType(job.type);

        const allLocalConfigs = await getLocalScraperConfigs();
        const scrapers: ScraperConfig[] = [];

        for (const config of allLocalConfigs) {
            const scraperSlug = config.slug;
            if (!scraperSlug) {
                continue;
            }

            // If specific scrapers are requested, filter by name/slug
            if (requestedScrapers.length > 0 && !requestedScrapers.includes(scraperSlug)) {
                continue;
            }

            const options: Record<string, unknown> = {};
            if (config.workflows && Array.isArray(config.workflows) && config.workflows.length > 0) {
                options.workflows = config.workflows;
            }
            if (typeof config.timeout === 'number') {
                options.timeout = config.timeout;
            }

            const searchUrlTemplate =
                'search_url_template' in config && typeof config.search_url_template === 'string'
                    ? config.search_url_template
                    : undefined;

            scrapers.push({
                name: scraperSlug,
                disabled: config.status === 'disabled' || config.status === 'archived',
                base_url: config.base_url,
                search_url_template: searchUrlTemplate,
                selectors: toSelectors(config.selectors),
                options,
                test_skus: config.test_skus,
                retries: config.retries,
                validation: config.validation,
                login: toRecord(config.login),
                credential_refs: config.credential_refs,
            });
        }

        console.log('[Poll] Scrapers from YAML:', scrapers.length);

        // Extract config from JSONB column
        const skus: string[] = job.skus || [];
        if (skus.length === 0) {
            console.error(`[Poll] Job ${job.job_id} has no SKUs - this should not happen`);
            return NextResponse.json(
                { error: 'Job has no SKUs configured' },
                { status: 400 }
            );
        }

        console.log(`[Poll] Runner ${runnerName} assigned job ${job.job_id}: ${skus.length} SKUs, ${scrapers.length} scrapers`);

        // Broadcast job assignment event to admin dashboard
        try {
            await supabase.channel('job-assignments').send({
                type: 'broadcast',
                event: 'job_assigned',
                payload: {
                    job_id: job.job_id,
                    runner_id: runnerName,
                    runner_name: runner.runnerName,
                    scrapers: job.scrapers || [],
                    skus_count: skus.length,
                    timestamp: new Date().toISOString(),
                },
            });
            console.log(`[Poll] Broadcast job_assigned event for ${job.job_id}`);
        } catch (broadcastError) {
            // Log but don't fail the request if broadcast fails
            console.error(`[Poll] Failed to broadcast job assignment: ${broadcastError}`);
        }

        const [aiDefaults, aiCredentials, featureFlags] = await Promise.all([
            getAIScrapingDefaults(),
            getAIScrapingRuntimeCredentials(),
            getGeminiFeatureFlags(),
        ]);

        // Transform scrapers to response format for runner consumption
        // Runner expects options.workflows and optional timeout
        const response: PollResponse = {
            job: {
                job_id: job.job_id,
                skus,
                scrapers,
                test_mode: job.test_mode || false,
                max_workers: job.max_workers || 3,
                job_type: normalizedJobType,
                job_config: (job.config || undefined) as Record<string, unknown> | undefined,
                ai_credentials: aiCredentials || undefined,
                feature_flags: featureFlags,
                lease_token: job.lease_token || undefined,
                lease_expires_at: job.lease_expires_at || undefined,
            },
        };

        if (response.job) {
            const isDiscovery = job.type === 'discovery' || requestedScrapers.includes('ai_discovery');
            if (isDiscovery) {
                const rawConfig = (job.config || {}) as Record<string, unknown>;
                const sanitizedDiscoveryConfig = sanitizeDiscoveryConfig(rawConfig, aiDefaults);
                const maxSearchResults = pickNumber(sanitizedDiscoveryConfig.max_search_results, aiDefaults.max_search_results);
                const maxSteps = pickNumber(sanitizedDiscoveryConfig.max_steps, aiDefaults.max_steps);
                const confidenceThreshold = pickNumber(sanitizedDiscoveryConfig.confidence_threshold, aiDefaults.confidence_threshold);
                const llmProvider = normalizeDiscoveryLLMProvider(
                    sanitizedDiscoveryConfig.llm_provider,
                    aiDefaults.llm_provider
                );
                const llmModel =
                    typeof sanitizedDiscoveryConfig.llm_model === 'string' && sanitizedDiscoveryConfig.llm_model.length > 0
                        ? sanitizedDiscoveryConfig.llm_model
                        : aiDefaults.llm_model;
                const llmBaseUrl =
                    typeof sanitizedDiscoveryConfig.llm_base_url === 'string' && sanitizedDiscoveryConfig.llm_base_url.length > 0
                        ? sanitizedDiscoveryConfig.llm_base_url
                        : aiDefaults.llm_base_url;

                const updatedScrapers = response.job.scrapers.map((scraper) => {
                    if (scraper.name !== 'ai_discovery') {
                        return scraper;
                    }

                    const nextOptions = {
                        ...(scraper.options || {}),
                        max_search_results: maxSearchResults,
                        max_steps: maxSteps,
                        confidence_threshold: confidenceThreshold,
                        llm_provider: llmProvider,
                        llm_model: llmModel,
                        ...(llmBaseUrl ? { llm_base_url: llmBaseUrl } : {}),
                    };

                    return {
                        ...scraper,
                        options: nextOptions,
                    };
                });

                response.job.scrapers = updatedScrapers;
                response.job.job_config = sanitizedDiscoveryConfig;
            }
        }

        return NextResponse.json(response, {
            headers: responseHeaders,
        });
    } catch (error) {
        console.error('[Poll] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
