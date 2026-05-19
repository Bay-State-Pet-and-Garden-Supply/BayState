import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from '@/lib/supabase/config';
import { NextResponse } from 'next/server';
import {
    getRunnerBuildCheck,
    loadExpectedRunnerRelease,
    buildRunnerBuildMetadata,
    createRunnerBuildMismatchResponse,
} from './scraper-runner-version';

interface RunnerAuthResult {
    runnerName: string;
    keyId?: string;
    authMethod: 'api_key';
    allowedScrapers: string[] | null;
}

export function normalizeScraperSlug(value: string): string {
    return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function normalizeAllowedScrapers(raw: unknown): string[] | null {
    if (raw === null || raw === undefined) {
        return null;
    }

    let candidates: unknown[] = [];

    if (Array.isArray(raw)) {
        candidates = raw;
    } else if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return [];
        }

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    candidates = parsed;
                } else {
                    candidates = [trimmed];
                }
            } catch {
                candidates = trimmed.split(',');
            }
        } else {
            candidates = trimmed.split(',');
        }
    } else {
        return [];
    }

    const normalized = candidates
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeScraperSlug)
        .filter((item) => item.length > 0);

    return Array.from(new Set(normalized));
}

function getSupabaseAdmin() {
    const url = SUPABASE_URL;
    const key = SUPABASE_SECRET_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration (SUPABASE_URL and SUPABASE_SECRET_KEY)');
    }
    return createClient(url, key);
}

/**
 * Validates an API key from the X-API-Key header.
 * This is the primary (and only) authentication method for scraper runners.
 */
export async function validateAPIKey(
    apiKey: string | null
): Promise<RunnerAuthResult | null> {
    if (!apiKey) {
        return null;
    }

    // Validate key format (should start with bsr_)
    if (!apiKey.startsWith('bsr_')) {
        console.error('[Runner Auth] Invalid API key format');
        return null;
    }

    try {
        const supabase = getSupabaseAdmin();

        // Preferred path: RPC for atomic validation + last_used_at update
        const { data, error } = await supabase.rpc('validate_runner_api_key', {
            api_key: apiKey
        });

        // Local/dev fallback when RPC is not installed
        if (error) {
            console.warn('[Runner Auth] RPC unavailable, falling back to direct hash validation:', error.message);

            const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
            const { data: runnerKey, error: runnerKeyError } = await supabase
                .from('runner_api_keys')
                .select('id, runner_name, allowed_scrapers, revoked_at, expires_at')
                .eq('key_hash', keyHash)
                .is('revoked_at', null)
                .single();

            if (runnerKeyError || !runnerKey) {
                console.error('[Runner Auth] Fallback validation failed:', runnerKeyError?.message ?? 'runner key not found');
                return null;
            }

            if (runnerKey.expires_at && new Date(runnerKey.expires_at).getTime() <= Date.now()) {
                console.error('[Runner Auth] API key is expired');
                return null;
            }

            return {
                runnerName: runnerKey.runner_name,
                keyId: runnerKey.id,
                authMethod: 'api_key',
                allowedScrapers: normalizeAllowedScrapers(runnerKey.allowed_scrapers),
            };
        }

        if (!data || data.length === 0 || !data[0].is_valid) {
            console.error('[Runner Auth] Invalid or expired API key');
            return null;
        }

        const result = data[0];
        return {
            runnerName: result.runner_name,
            keyId: result.key_id,
            authMethod: 'api_key',
            allowedScrapers: normalizeAllowedScrapers(result.allowed_scrapers),
        };
    } catch (error) {
        console.error('[Runner Auth] Validation error:', error);
        return null;
    }
}

/**
 * Validates runner authentication using API key.
 * 
 * Previously supported HMAC and JWT fallback methods for migration,
 * but those have been deprecated. Only API key auth is now supported.
 */
export async function validateRunnerAuth(
    headers: {
        apiKey?: string | null;
        authorization?: string | null;
    }
): Promise<RunnerAuthResult | null> {
    // Only API key authentication is supported
    if (headers.apiKey) {
        return await validateAPIKey(headers.apiKey);
    }

    // Legacy Authorization header - extract API key if it looks like one
    if (headers.authorization?.startsWith('Bearer bsr_')) {
        const apiKey = headers.authorization.slice(7);
        return await validateAPIKey(apiKey);
    }

    return null;
}

/**
 * Generates a new API key for a runner.
 * Returns the full key (only shown once) and the hash for storage.
 */
export function generateAPIKey(): { key: string; hash: string; prefix: string } {
    // Generate 32 random bytes = 256 bits of entropy
    const randomBytes = crypto.randomBytes(32);
    const keyBody = randomBytes.toString('base64url');
    
    // Prefix with bsr_ (Bay State Runner)
    const key = `bsr_${keyBody}`;
    
    // Hash for storage
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    
    // Prefix for identification
    const prefix = key.substring(0, 12);
    
    return { key, hash, prefix };
}

export interface ActiveRunnerResult {
    isAuthenticated: boolean;
    isEnabled: boolean;
    runner?: RunnerAuthResult;
    mismatchResponse?: NextResponse;
}

/**
 * Validates runner authentication, and also ensures that the runner is enabled and compatible.
 * If the runner is disabled in the database, blocks the request (isEnabled = false).
 * If the runner is outdated, auto-disables it in the database and returns a 426 mismatch response.
 */
export async function validateActiveRunner(
    request: Request
): Promise<ActiveRunnerResult> {
    const apiKey = request.headers.get('X-API-Key');
    const authorization = request.headers.get('Authorization');
    
    const runner = await validateRunnerAuth({ apiKey, authorization });
    if (!runner) {
        return { isAuthenticated: false, isEnabled: false };
    }

    try {
        const supabase = getSupabaseAdmin();
        const runnerName = runner.runnerName;

        // Fetch current scraper_runner row
        const { data: runnerRow, error: dbError } = await supabase
            .from('scraper_runners')
            .select('enabled, metadata')
            .eq('name', runnerName)
            .maybeSingle();

        if (dbError) {
            console.error(`[Active Runner Auth] DB error looking up runner ${runnerName}:`, dbError);
            // On DB error, default to letting it pass if authenticated, to be resilient
            return { isAuthenticated: true, isEnabled: true, runner };
        }

        
        // If runner exists and is disabled, block it immediately
        if (runnerRow && runnerRow.enabled === false) {
            console.warn(`[Active Runner Auth] Blocked request from disabled runner: ${runnerName}`);
            return { isAuthenticated: true, isEnabled: false, runner };
        }

        // Perform build version verification check
        const expectedRelease = await loadExpectedRunnerRelease(supabase, request.headers);
        const versionCheck = getRunnerBuildCheck(request.headers, expectedRelease);

        if (!versionCheck.isCompatible) {
            const nowIso = new Date().toISOString();
            const versionMetadata = buildRunnerBuildMetadata(
                runnerRow?.metadata,
                versionCheck,
                nowIso
            );

            // Auto-disable the runner in DB just like heartbeat does
            await supabase.from('scraper_runners').update({ 
                enabled: false, 
                status: 'offline',
                metadata: versionMetadata,
                last_seen_at: nowIso,
            }).eq('name', runnerName);

            console.warn(`[Active Runner Auth] Outdated build version from runner ${runnerName}. Auto-disabling.`);

            const mismatchResponse = createRunnerBuildMismatchResponse(versionCheck, {
                'X-Enforced-Runner-Name': runnerName,
            });

            return {
                isAuthenticated: true,
                isEnabled: false,
                runner,
                mismatchResponse,
            };
        }

        return { isAuthenticated: true, isEnabled: true, runner };
    } catch (error) {
        console.error(`[Active Runner Auth] Error validating active runner ${runner.runnerName}:`, error);
        return { isAuthenticated: true, isEnabled: true, runner };
    }
}

