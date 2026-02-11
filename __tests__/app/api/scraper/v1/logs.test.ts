
/**
 * @jest-environment node
 */
/**
 * @jest-environment node
 */
import { POST } from '@/app/api/scraper/v1/logs/route';
import { NextRequest } from 'next/server';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { createClient } from '@supabase/supabase-js';

jest.mock('@/lib/scraper-auth', () => ({
    validateRunnerAuth: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

describe('POST /api/scraper/v1/logs', () => {
    let mockSupabase: any;

    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
        jest.clearAllMocks();

        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
        };
        (createClient as jest.Mock).mockReturnValue(mockSupabase);
    });

    const createRequest = (body: any, headers: Record<string, string> = {}) => {
        const reqHeaders = new Map(Object.entries(headers));
        if (!reqHeaders.has('Content-Type')) {
            reqHeaders.set('Content-Type', 'application/json');
        }

        return {
            headers: {
                get: (key: string) => reqHeaders.get(key) || null,
            },
            json: async () => body,
        } as unknown as NextRequest;
    };

    it('should return 401 if authentication fails', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

        const req = createRequest({ job_id: 'job-123', logs: [] });
        const res = await POST(req);

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 if validation fails (missing job_id)', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({ runnerName: 'test-runner' });

        const req = createRequest({ logs: [] });
        const res = await POST(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Missing required fields');
    });

    it('should return 400 if validation fails (missing logs array)', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({ runnerName: 'test-runner' });

        const req = createRequest({ job_id: 'job-123' });
        const res = await POST(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Missing required fields');
    });

    it('should successfully insert logs', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({ runnerName: 'test-runner' });
        mockSupabase.insert.mockResolvedValue({ error: null });

        const logs = [
            { level: 'INFO', message: 'Log 1', timestamp: '2023-01-01T00:00:00Z' },
            { level: 'ERROR', message: 'Log 2', timestamp: '2023-01-01T00:00:01Z' },
        ];
        const req = createRequest({ job_id: 'job-123', logs });
        const res = await POST(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);

        expect(mockSupabase.from).toHaveBeenCalledWith('scrape_job_logs');
        expect(mockSupabase.insert).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                job_id: 'job-123',
                level: 'info',
                message: 'Log 1',
                created_at: '2023-01-01T00:00:00Z',
            }),
            expect.objectContaining({
                job_id: 'job-123',
                level: 'error',
                message: 'Log 2',
                created_at: '2023-01-01T00:00:01Z',
            }),
        ]));
    });

    it('should handle database errors gracefully', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({ runnerName: 'test-runner' });
        mockSupabase.insert.mockResolvedValue({ error: { message: 'DB Error' } });

        const req = createRequest({ job_id: 'job-123', logs: [{ level: 'INFO', message: 'test' }] });
        const res = await POST(req);

        expect(res.status).toBe(500);
        const data = await res.json();
        expect(data.error).toBe('Failed to insert logs');
    });
});
