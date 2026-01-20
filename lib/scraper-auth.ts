import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export interface RunnerAuthResult {
    runnerName: string;
    keyId?: string;
    authMethod: 'api_key';
    allowedScrapers: string[] | null;
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
        
        // Use the database function to validate and update last_used_at atomically
        const { data, error } = await supabase.rpc('validate_runner_api_key', {
            api_key: apiKey
        });

        if (error) {
            console.error('[Runner Auth] RPC error:', error.message);
            return null;
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
            allowedScrapers: result.allowed_scrapers ?? null,
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
