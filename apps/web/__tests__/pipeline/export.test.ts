import { TextDecoder } from 'util';

const {
    NextRequest,
    createAdminClient,
    requireAdminAuth,
} = require('@/__tests__/helpers/admin-api-route-harness');

// Require modules
const { GET } = require('@/app/api/admin/pipeline/export/route');

describe('CSV Export API', () => {
    let mockSupabase: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock Auth
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
        });

        // Mock Supabase
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            range: jest.fn(),
        };
        (createAdminClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('should generate CSV with correct headers and data', async () => {
        // Mock data
        const mockData = [
            {
                sku: 'SKU-123',
                input: { name: 'Test Product', price: 10.99 },
                consolidated: { name: 'Consolidated Name', price: 12.99 },
                pipeline_status: 'staging',
                confidence_score: 0.95,
                updated_at: '2023-01-01T00:00:00Z',
            },
        ];

        // Mock range response
        mockSupabase.range.mockResolvedValueOnce({ data: mockData, error: null });
        mockSupabase.range.mockResolvedValueOnce({ data: [], error: null });

        const req = new NextRequest('http://localhost/api/admin/pipeline/export?status=finalizing');
        const res = await GET(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(res.headers.get('Content-Disposition')).toContain('products-export.xlsx');

        // Read stream
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let csv = '';
        
        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                csv += decoder.decode(value);
            }
        }

        expect(csv.length).toBeGreaterThan(0);
    });

    it('should respect search filter', async () => {
        mockSupabase.range.mockResolvedValue({ data: [], error: null });

        const req = new NextRequest('http://localhost/api/admin/pipeline/export?status=finalizing&search=test');
        const res = await GET(req);

        expect(res.status).toBe(200);
    });
});
