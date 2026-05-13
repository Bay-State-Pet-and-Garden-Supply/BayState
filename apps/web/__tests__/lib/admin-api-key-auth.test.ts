/**
 * @jest-environment node
 */

// Mock config first so the module is loaded with test values
jest.mock('@/lib/supabase/config', () => ({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SECRET_KEY: 'test-service-key',
    SUPABASE_ANON_KEY: 'test-anon-key',
    requireSupabaseConfig: jest.fn().mockReturnValue({
        url: 'https://test.supabase.co',
        anonKey: 'test-anon-key',
    }),
}));

import {
    validateAdminApiKeyValue,
    validateAdminApiKey,
    generateAdminApiKey,
} from '@/lib/admin-api-key-auth';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('admin-api-key-auth', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateAdminApiKey', () => {
        it('generates a key with correct format', () => {
            const { key, hash, prefix } = generateAdminApiKey();

            // bsa_ prefix + base64url body
            expect(key).toMatch(/^bsa_[A-Za-z0-9_-]+$/);
            expect(key.length).toBeGreaterThan(20);

            // SHA-256 hex hash = 64 hex characters
            expect(hash).toMatch(/^[a-f0-9]{64}$/);

            // Prefix should be the first 12 characters of the key
            expect(prefix).toBe(key.substring(0, 12));
        });

        it('generates unique keys on each call', () => {
            const key1 = generateAdminApiKey();
            const key2 = generateAdminApiKey();

            expect(key1.key).not.toBe(key2.key);
            expect(key1.hash).not.toBe(key2.hash);
        });

        it('prefixes keys with bsa_ (not bsr_)', () => {
            const { key } = generateAdminApiKey();
            expect(key.startsWith('bsa_')).toBe(true);
            expect(key.startsWith('bsr_')).toBe(false);
        });

        it('generates keys with sufficient entropy', () => {
            const { key } = generateAdminApiKey();

            // Key body (after bsa_) should be at least 40 chars (32 bytes base64url)
            const body = key.slice(4);
            expect(body.length).toBeGreaterThanOrEqual(40);
        });
    });

    describe('validateAdminApiKeyValue', () => {
        it('returns null for null key', async () => {
            const result = await validateAdminApiKeyValue(null);
            expect(result).toBeNull();
        });

        it('returns null for empty string key', async () => {
            const result = await validateAdminApiKeyValue('');
            expect(result).toBeNull();
        });

        it('returns null for key without bsa_ prefix', async () => {
            const result = await validateAdminApiKeyValue('invalid-key');
            expect(result).toBeNull();
        });

        it('returns null for runner key (bsr_ prefix) — prefix isolation', async () => {
            const result = await validateAdminApiKeyValue('bsr_some-runner-key-here');
            expect(result).toBeNull();
        });

        it('returns user info for a valid admin API key', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ user_id: 'user-123', key_id: 'key-456', is_valid: true }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateAdminApiKeyValue('bsa_valid-test-key');

            expect(result).toEqual({
                userId: 'user-123',
                keyId: 'key-456',
                authMethod: 'api_key',
            });
        });

        it('returns null when RPC returns is_valid: false', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ user_id: null, key_id: null, is_valid: false }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateAdminApiKeyValue('bsa_revoked-or-expired-key');
            expect(result).toBeNull();
        });

        it('returns null when RPC returns empty data array', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateAdminApiKeyValue('bsa_no-result-key');
            expect(result).toBeNull();
        });

        it('returns null when RPC returns an error', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'function validate_user_api_key(text) does not exist' },
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateAdminApiKeyValue('bsa_rpc-error-key');
            expect(result).toBeNull();
        });

        it('returns null when RPC throws an exception', async () => {
            const mockRpc = jest.fn().mockRejectedValue(new Error('Network error'));

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateAdminApiKeyValue('bsa_network-error-key');
            expect(result).toBeNull();
        });
    });

    describe('validateAdminApiKey', () => {
        it('extracts key from X-API-Key header', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ user_id: 'user-abc', key_id: 'key-xyz', is_valid: true }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateAdminApiKey({
                apiKey: 'bsa_header-key-here',
            });

            expect(result).toEqual({
                userId: 'user-abc',
                keyId: 'key-xyz',
                authMethod: 'api_key',
            });
        });

        it('extracts key from Authorization: Bearer bsa_* header', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ user_id: 'user-def', key_id: 'key-uvw', is_valid: true }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateAdminApiKey({
                authorization: 'Bearer bsa_bearer-key-value',
            });

            expect(result).toEqual({
                userId: 'user-def',
                keyId: 'key-uvw',
                authMethod: 'api_key',
            });
        });

        it('prefers X-API-Key over Authorization header', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ user_id: 'user-from-api-key', key_id: 'key-111', is_valid: true }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateAdminApiKey({
                apiKey: 'bsa_api-key-value',
                authorization: 'Bearer bsa_bearer-value',
            });

            // Should call RPC with the apiKey value, not the authorization value
            expect(mockRpc).toHaveBeenCalledWith('validate_user_api_key', {
                api_key: 'bsa_api-key-value',
            });
            expect(result?.userId).toBe('user-from-api-key');
        });

        it('returns null if neither header is provided', async () => {
            const result = await validateAdminApiKey({});
            expect(result).toBeNull();
        });

        it('returns null if Authorization header is a JWT token (not bsa_)', async () => {
            const result = await validateAdminApiKey({
                authorization: 'Bearer eyJhbGciOiJIUzI1NiIs...',
            });
            expect(result).toBeNull();
        });

        it('returns null if Authorization header uses bsr_ prefix (cross-namespace isolation)', async () => {
            const result = await validateAdminApiKey({
                authorization: 'Bearer bsr_runner-key-cross-talk',
            });
            expect(result).toBeNull();
        });
    });
});
