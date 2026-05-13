/**
 * @jest-environment node
 *
 * Integration tests for /api/admin/api-keys CRUD routes.
 */

// ── Mock next/server ──────────────────────────────────────────────
jest.mock('next/server', () => {
    const MockNextResponse = class {
        readonly body: unknown;
        readonly status: number;

        constructor(body: unknown, init?: { status?: number }) {
            this.body = body;
            this.status = init?.status ?? 200;
        }

        static json(body: unknown, init?: { status?: number }) {
            return new MockNextResponse(body, init);
        }

        async json() { return this.body; }
    };

    return {
        NextRequest: class {
            private readonly bodyText: string;
            readonly headers: Headers;
            readonly nextUrl: URL;

            constructor(
                url: string,
                init?: { body?: string; headers?: Record<string, string> }
            ) {
                this.bodyText = init?.body ?? '';
                this.nextUrl = new URL(url, 'http://localhost');
                const headerMap = new Map<string, string>();
                if (init?.headers) {
                    Object.entries(init.headers).forEach(([key, value]) => {
                        headerMap.set(key.toLowerCase(), value);
                    });
                }
                this.headers = {
                    get: (key: string) => headerMap.get(key.toLowerCase()) ?? null,
                } as Headers;
            }

            async text() { return this.bodyText; }
            async json() { return JSON.parse(this.bodyText || '{}'); }
        },
        NextResponse: MockNextResponse,
    };
});

// ── Mock server-side client ───────────────────────────────────────
const mockAdminClient = {
    from: jest.fn(),
};

jest.mock('@/lib/supabase/server', () => ({
    createAdminClient: jest.fn(() => Promise.resolve(mockAdminClient)),
    createClient: jest.fn(),
}));

// ── Mock dependencies ─────────────────────────────────────────────
jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/admin-api-key-auth', () => ({
    generateAdminApiKey: jest.fn(),
}));

// ── Imports after mocks ───────────────────────────────────────────
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/admin/api-keys/route';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { generateAdminApiKey } from '@/lib/admin-api-key-auth';

const mockRequireAdminAuth = requireAdminAuth as jest.MockedFunction<typeof requireAdminAuth>;
const mockGenerateAdminApiKey = generateAdminApiKey as jest.MockedFunction<typeof generateAdminApiKey>;

// ── Helpers ───────────────────────────────────────────────────────
function authOk(userId = 'user-abc-123') {
    return {
        authorized: true as const,
        user: { id: userId, email: 'admin@test.com' },
        role: 'admin' as const,
    };
}

function auth401(): any {
    return {
        authorized: false as const,
        response: { status: 401, json: async () => ({ error: 'Unauthorized' }) },
    };
}

function auth403(): any {
    return {
        authorized: false as const,
        response: { status: 403, json: async () => ({ error: 'Forbidden: Admin or staff access required' }) },
    };
}

// ── Tests ─────────────────────────────────────────────────────────
describe('GET /api/admin/api-keys', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 401 when not authenticated', async () => {
        mockRequireAdminAuth.mockResolvedValue(auth401());
        const req = new NextRequest('http://localhost/api/admin/api-keys');
        const response = await GET(req);
        expect(response.status).toBe(401);
    });

    it('returns masked keys for authenticated admin', async () => {
        mockRequireAdminAuth.mockResolvedValue(authOk());

        const mockOrder = jest.fn().mockResolvedValue({
            data: [
                {
                    id: 'key-1',
                    key_prefix: 'bsa_a1b2c3d4e5f6',
                    description: 'Production key',
                    created_at: '2026-05-01T00:00:00Z',
                    expires_at: null,
                    last_used_at: '2026-05-13T12:00:00Z',
                    revoked_at: null,
                },
                {
                    id: 'key-2',
                    key_prefix: 'bsa_f6e5d4c3b2a1',
                    description: null,
                    created_at: '2026-04-01T00:00:00Z',
                    expires_at: null,
                    last_used_at: null,
                    revoked_at: '2026-04-15T00:00:00Z',
                },
            ],
            error: null,
        });
        const mockEq = jest.fn().mockReturnValue({ order: mockOrder });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
        mockAdminClient.from.mockReturnValue({ select: mockSelect });

        const req = new NextRequest('http://localhost/api/admin/api-keys');
        const response = await GET(req);
        expect(response.status).toBe(200);
        const body = await response.json();

        expect(body.api_keys).toHaveLength(2);
        expect(body.api_keys[0]).toEqual({
            id: 'key-1',
            key_suffix: 'bsa_a1b2...e5f6',
            description: 'Production key',
            created_at: '2026-05-01T00:00:00Z',
            expires_at: null,
            last_used_at: '2026-05-13T12:00:00Z',
            revoked_at: null,
            is_active: true,
        });
        expect(body.api_keys[1].is_active).toBe(false);
    });

    it('returns empty array when user has no keys', async () => {
        mockRequireAdminAuth.mockResolvedValue(authOk());

        const mockOrder = jest.fn().mockResolvedValue({ data: [], error: null });
        const mockEq = jest.fn().mockReturnValue({ order: mockOrder });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
        mockAdminClient.from.mockReturnValue({ select: mockSelect });

        const req = new NextRequest('http://localhost/api/admin/api-keys');
        const response = await GET(req);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.api_keys).toEqual([]);
    });

    it('returns 500 on DB error', async () => {
        mockRequireAdminAuth.mockResolvedValue(authOk());

        const mockOrder = jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Connection failed' },
        });
        const mockEq = jest.fn().mockReturnValue({ order: mockOrder });
        const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
        mockAdminClient.from.mockReturnValue({ select: mockSelect });

        const req = new NextRequest('http://localhost/api/admin/api-keys');
        const response = await GET(req);
        expect(response.status).toBe(500);
    });
});

describe('POST /api/admin/api-keys', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 401 when not authenticated', async () => {
        mockRequireAdminAuth.mockResolvedValue(auth401());
        const req = new NextRequest('http://localhost/api/admin/api-keys', {
            body: '{}',
        });
        const response = await POST(req);
        expect(response.status).toBe(401);
    });

    it('creates a key and returns the full key once', async () => {
        mockRequireAdminAuth.mockResolvedValue(authOk());
        mockGenerateAdminApiKey.mockReturnValue({
            key: 'bsa_created-key-value-here',
            hash: 'a'.repeat(64),
            prefix: 'bsa_created-',
        });

        const mockSingle = jest.fn().mockResolvedValue({
            data: { id: 'key-new-123' },
            error: null,
        });
        const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
        const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
        mockAdminClient.from.mockReturnValue({ insert: mockInsert });

        const req = new NextRequest('http://localhost/api/admin/api-keys', {
            body: JSON.stringify({ description: 'My API key' }),
        });
        const response = await POST(req);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.id).toBe('key-new-123');
        expect(body.api_key).toBe('bsa_created-key-value-here');
        expect(body.key_prefix).toBe('bsa_created-');
        expect(body.description).toBe('My API key');
        expect(body.message).toContain('Save this API key now');
    });

    it('creates key with expiry', async () => {
        mockRequireAdminAuth.mockResolvedValue(authOk());
        mockGenerateAdminApiKey.mockReturnValue({
            key: 'bsa_expiring-key-value',
            hash: 'b'.repeat(64),
            prefix: 'bsa_expiring',
        });

        const mockSingle = jest.fn().mockResolvedValue({
            data: { id: 'key-exp-456' },
            error: null,
        });
        const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
        const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
        mockAdminClient.from.mockReturnValue({ insert: mockInsert });

        const req = new NextRequest('http://localhost/api/admin/api-keys', {
            body: JSON.stringify({ description: '30-day key', expires_in_days: 30 }),
        });
        const response = await POST(req);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.expires_at).toBeTruthy();
        const expiresAt = new Date(body.expires_at);
        const now = Date.now();
        const diffMs = expiresAt.getTime() - now;
        expect(diffMs).toBeGreaterThan(29 * 86400000);
        expect(diffMs).toBeLessThan(31 * 86400000);
    });

    it('returns 500 when insert fails', async () => {
        mockRequireAdminAuth.mockResolvedValue(authOk());
        mockGenerateAdminApiKey.mockReturnValue({
            key: 'bsa_fail-key-value',
            hash: 'c'.repeat(64),
            prefix: 'bsa_fail-key',
        });

        const mockSingle = jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Insert failed' },
        });
        const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
        const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
        mockAdminClient.from.mockReturnValue({ insert: mockInsert });

        const req = new NextRequest('http://localhost/api/admin/api-keys', {
            body: '{}',
        });
        const response = await POST(req);
        expect(response.status).toBe(500);
    });

    it('handles empty body gracefully (no description)', async () => {
        mockRequireAdminAuth.mockResolvedValue(authOk());
        mockGenerateAdminApiKey.mockReturnValue({
            key: 'bsa_no-body-key-value',
            hash: 'd'.repeat(64),
            prefix: 'bsa_no-body-',
        });

        const mockSingle = jest.fn().mockResolvedValue({
            data: { id: 'key-empty-789' },
            error: null,
        });
        const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
        const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
        mockAdminClient.from.mockReturnValue({ insert: mockInsert });

        const req = new NextRequest('http://localhost/api/admin/api-keys', {
            body: '',
        });
        const response = await POST(req);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.api_key).toBe('bsa_no-body-key-value');
        expect(body.description).toBeNull();
    });
});
