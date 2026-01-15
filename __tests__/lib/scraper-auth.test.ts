/**
 * @jest-environment node
 */
import {
    validateAPIKey,
    validateRunnerAuth,
    generateAPIKey
} from '@/lib/scraper-auth';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('scraper-auth', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...originalEnv,
            NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
            SCRAPER_WEBHOOK_SECRET: 'test-webhook-secret',
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('generateAPIKey', () => {
        it('generates a key with correct format', () => {
            const { key, hash, prefix } = generateAPIKey();

            expect(key).toMatch(/^bsr_[A-Za-z0-9_-]+$/);
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
            expect(prefix).toBe(key.substring(0, 12));
        });

        it('generates unique keys', () => {
            const key1 = generateAPIKey();
            const key2 = generateAPIKey();

            expect(key1.key).not.toBe(key2.key);
            expect(key1.hash).not.toBe(key2.hash);
        });
    });

    describe('validateAPIKey', () => {
        it('returns null for null key', async () => {
            const result = await validateAPIKey(null);
            expect(result).toBeNull();
        });

        it('returns null for key without bsr_ prefix', async () => {
            const result = await validateAPIKey('invalid-key');
            expect(result).toBeNull();
        });

        it('returns runner info for valid key', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ runner_name: 'test-runner', key_id: 'key-123', is_valid: true }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateAPIKey('bsr_valid-test-key');

            expect(result).toEqual({
                runnerName: 'test-runner',
                keyId: 'key-123',
                authMethod: 'api_key',
            });
        });

        it('returns null for invalid key', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ is_valid: false }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateAPIKey('bsr_invalid-key');
            expect(result).toBeNull();
        });
    });

    describe('validateRunnerAuth', () => {
        it('prefers API key over other methods', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ runner_name: 'api-key-runner', key_id: 'key-123', is_valid: true }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateRunnerAuth({
                apiKey: 'bsr_valid-key',
            });

            expect(result?.authMethod).toBe('api_key');
            expect(result?.runnerName).toBe('api-key-runner');
        });

        it('returns null if no valid authentication is provided', async () => {
            const result = await validateRunnerAuth({});
            expect(result).toBeNull();
        });
    });
});
