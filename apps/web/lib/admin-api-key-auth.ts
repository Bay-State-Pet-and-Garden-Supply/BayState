import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from '@/lib/supabase/config';

interface AdminApiKeyResult {
    userId: string;
    keyId: string;
    authMethod: 'api_key';
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
 * Validates an admin API key value.
 * Checks the bsa_ prefix, then validates via the RPC.
 *
 * Returns null if the key is missing, has the wrong prefix, or is invalid/revoked/expired.
 * Never returns partial results — null means "not authorized."
 */
export async function validateAdminApiKeyValue(
    apiKey: string | null
): Promise<AdminApiKeyResult | null> {
    if (!apiKey) {
        return null;
    }

    // Validate key format (must start with bsa_)
    if (!apiKey.startsWith('bsa_')) {
        console.error('[Admin API Key Auth] Invalid API key format — must start with bsa_');
        return null;
    }

    try {
        const supabase = getSupabaseAdmin();

        // RPC for atomic validation + last_used_at update
        const { data, error } = await supabase.rpc('validate_user_api_key', {
            api_key: apiKey,
        });

        if (error) {
            console.error(
                '[Admin API Key Auth] RPC validation failed:',
                {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint
                }
            );
            return null;
        }

        if (!data || data.length === 0 || !data[0].is_valid) {
            console.error('[Admin API Key Auth] Invalid, revoked, or expired API key');
            return null;
        }

        const result = data[0];
        return {
            userId: result.user_id,
            keyId: result.key_id,
            authMethod: 'api_key',
        };
    } catch (error) {
        console.error('[Admin API Key Auth] Validation error:', error);
        return null;
    }
}

/**
 * Validates an admin API key from request headers.
 * Extracts the key from the X-API-Key header or Authorization: Bearer bsa_*.
 *
 * Returns the same result as validateAdminApiKeyValue, or null if no key is present.
 */
export async function validateAdminApiKey(
    headers: {
        apiKey?: string | null;
        authorization?: string | null;
    }
): Promise<AdminApiKeyResult | null> {
    // Check X-API-Key header first
    if (headers.apiKey) {
        return await validateAdminApiKeyValue(headers.apiKey);
    }

    // Check Authorization header for Bearer bsa_*
    if (headers.authorization?.startsWith('Bearer bsa_')) {
        const apiKey = headers.authorization.slice(7);
        return await validateAdminApiKeyValue(apiKey);
    }

    return null;
}

/**
 * Generates a new admin API key.
 * Returns the full key (only shown once), its hash for storage, and prefix for identification.
 *
 * Key format: bsa_<32 random bytes base64url>
 * Hash: SHA-256 hex digest
 * Prefix: first 12 characters
 */
export function generateAdminApiKey(): { key: string; hash: string; prefix: string } {
    // Generate 32 random bytes = 256 bits of entropy
    const randomBytes = crypto.randomBytes(32);
    const keyBody = randomBytes.toString('base64url');

    // Prefix with bsa_ (BayState Admin)
    const key = `bsa_${keyBody}`;

    // Hash for storage
    const hash = crypto.createHash('sha256').update(key).digest('hex');

    // Prefix for identification
    const prefix = key.substring(0, 12);

    return { key, hash, prefix };
}
