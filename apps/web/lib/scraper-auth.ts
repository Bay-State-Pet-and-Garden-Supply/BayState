import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export interface RunnerAuthResult {
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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
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
            const { data: runner, error: runnerError } = await supabase
                .from('scraper_runners')
                .select('id, name, allowed_scrapers, status')
                .eq('api_key_hash', keyHash)
                .single();

            if (runnerError || !runner) {
                console.error('[Runner Auth] Fallback validation failed:', runnerError?.message ?? 'runner not found');
                return null;
            }

            if (runner.status === 'revoked') {
                console.error('[Runner Auth] API key is revoked');
                return null;
            }

            return {
                runnerName: runner.name,
                keyId: runner.id,
                authMethod: 'api_key',
                allowedScrapers: normalizeAllowedScrapers(runner.allowed_scrapers),
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
