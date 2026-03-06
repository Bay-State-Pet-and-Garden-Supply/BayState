/**
 * @jest-environment node
 * 
 * Shared auth test utilities for scraper callback routes.
 * Tests that invalid/missing API keys return 401 in all environments.
 * Ensures no local auth bypass exists.
 */
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('scraper-callback-auth', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...originalEnv,
            NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('auth failures return null (enforcing 401)', () => {
        it('returns null when X-API-Key header is missing', async () => {
            const result = await validateRunnerAuth({
                apiKey: undefined,
                authorization: undefined,
            });
            expect(result).toBeNull();
        });

        it('returns null when X-API-Key header is null', async () => {
            const result = await validateRunnerAuth({
                apiKey: null,
                authorization: null,
            });
            expect(result).toBeNull();
        });

        it('returns null when X-API-Key header is empty string', async () => {
            const result = await validateRunnerAuth({
                apiKey: '',
                authorization: '',
            });
            expect(result).toBeNull();
        });

        it('returns null for invalid API key format (not starting with bsr_)', async () => {
            const result = await validateRunnerAuth({
                apiKey: 'invalid-key-format',
            });
            expect(result).toBeNull();
        });

        it('returns null for key starting with wrong prefix', async () => {
            const result = await validateRunnerAuth({
                apiKey: 'sk_test_12345',
            });
            expect(result).toBeNull();
        });

        it('returns null for malformed Authorization header (no Bearer)', async () => {
            const result = await validateRunnerAuth({
                authorization: 'some-token',
            });
            expect(result).toBeNull();
        });

        it('returns null for malformed Authorization header (Bearer without key)', async () => {
            const result = await validateRunnerAuth({
                authorization: 'Bearer ',
            });
            expect(result).toBeNull();
        });

        it('returns null for malformed Authorization header (wrong prefix)', async () => {
            const result = await validateRunnerAuth({
                authorization: 'Basic bsr_xxxx',
            });
            expect(result).toBeNull();
        });

        it('returns null for Bearer with invalid key format', async () => {
            const result = await validateRunnerAuth({
                authorization: 'Bearer invalid-key',
            });
            expect(result).toBeNull();
        });
    });

    describe('auth successes return runner info (allowing request)', () => {
        it('returns runner info for valid X-API-Key header', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ runner_name: 'test-runner', key_id: 'key-123', is_valid: true }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateRunnerAuth({
                apiKey: 'bsr_valid-test-key-12345',
            });

            expect(result).not.toBeNull();
            expect(result?.runnerName).toBe('test-runner');
            expect(result?.authMethod).toBe('api_key');
            expect(result?.keyId).toBe('key-123');
        });

        it('returns runner info for valid Bearer token in Authorization header', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ runner_name: 'bearer-runner', key_id: 'key-456', is_valid: true }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateRunnerAuth({
                authorization: 'Bearer bsr_valid-bearer-key',
            });

            expect(result).not.toBeNull();
            expect(result?.runnerName).toBe('bearer-runner');
            expect(result?.authMethod).toBe('api_key');
        });

        it('prefers X-API-Key over Authorization header', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ runner_name: 'api-key-runner', key_id: 'key-789', is_valid: true }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateRunnerAuth({
                apiKey: 'bsr_api-key-preferred',
                authorization: 'Bearer bsr_authorization-key',
            });

            expect(result?.runnerName).toBe('api-key-runner');
        });
    });

    describe('invalid/expired keys return null (enforcing 401)', () => {
        it('returns null for expired API key', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ is_valid: false, runner_name: null }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateRunnerAuth({
                apiKey: 'bsr_expired-key',
            });

            expect(result).toBeNull();
        });

        it('returns null for non-existent API key', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateRunnerAuth({
                apiKey: 'bsr_nonexistent-key',
            });

            expect(result).toBeNull();
        });

        it('returns null when RPC returns error', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database error' },
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            const result = await validateRunnerAuth({
                apiKey: 'bsr_db-error-key',
            });

            expect(result).toBeNull();
        });
    });

    describe('environment consistency (no local bypass)', () => {
        it('returns null for invalid key regardless of environment', async () => {
            // Test with NODE_ENV = development
            const prevNodeEnv = process.env.NODE_ENV;
            (process.env as any).NODE_ENV = 'development';

            const result = await validateRunnerAuth({
                apiKey: 'invalid-key',
            });

            expect(result).toBeNull();

            // Test with NODE_ENV = production
            (process.env as any).NODE_ENV = 'production';

            const resultProd = await validateRunnerAuth({
                apiKey: 'invalid-key',
            });

            expect(resultProd).toBeNull();

            (process.env as any).NODE_ENV = prevNodeEnv;
        });

        it('validates key format before checking database', async () => {
            // Even if database is available, invalid format should fail fast
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ runner_name: 'should-not-be-used', is_valid: true }],
                error: null,
            });

            mockCreateClient.mockReturnValue({ rpc: mockRpc } as never);

            // This should fail at format validation, never reaching DB
            const result = await validateRunnerAuth({
                apiKey: 'not-a-bsr-key',
            });

            expect(result).toBeNull();
            // RPC should not have been called for invalid format
            expect(mockRpc).not.toHaveBeenCalled();
        });
    });
});
