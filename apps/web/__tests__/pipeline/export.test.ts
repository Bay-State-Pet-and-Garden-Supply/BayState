/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

jest.mock('xlsx', () => ({
    utils: {
        json_to_sheet: jest.fn(() => ({ mocked: true })),
        book_new: jest.fn(() => ({ sheets: [] })),
        book_append_sheet: jest.fn(),
    },
    write: jest.fn(() => Buffer.from('xlsx-data')),
}));

const { GET } = require('@/app/api/admin/pipeline/export/route');
const { createClient } = require('@/lib/supabase/server');

describe('pipeline export route', () => {
    let mockSupabase: any;
    let mockLimit: jest.Mock;
    let mockOr: jest.Mock;
    let mockEq: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLimit = jest.fn();
        mockOr = jest.fn(() => ({ limit: mockLimit }));
        mockEq = jest.fn(() => ({
            or: mockOr,
            limit: mockLimit,
        }));

        mockSupabase = {
            from: jest.fn(() => ({
                select: jest.fn(() => ({
                    eq: mockEq,
                })),
            })),
        };

        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('exports CSV using finalized status by default', async () => {
        mockLimit.mockResolvedValue({
            data: [
                {
                    sku: 'SKU-123',
                    input: { name: 'Test Product', price: 10.99 },
                    consolidated: { name: 'Consolidated Name', price: 12.99 },
                    pipeline_status: 'finalized',
                    created_at: '2023-01-01T00:00:00Z',
                    updated_at: '2023-01-02T00:00:00Z',
                },
            ],
            error: null,
        });

        const req = new Request('http://localhost/api/admin/pipeline/export?format=csv');
        const res = await GET(req);

        expect(res.status).toBe(200);
        expect(mockEq).toHaveBeenCalledWith('pipeline_status', 'finalized');
        expect(res.headers.get('Content-Type')).toBe('text/csv');
        expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="export-finalized.csv"');

        const csv = await res.text();
        const lines = csv.trim().split('\n');
        expect(lines[0]).toBe('SKU,Name,Description,Price,Brand,StockStatus,PipelineStatus,CreatedAt,UpdatedAt');
        expect(lines[1]).toContain('"SKU-123","Consolidated Name"');
        expect(lines[1]).toContain('"finalized"');
    });

    it('applies the search filter before exporting', async () => {
        mockLimit.mockResolvedValue({ data: [], error: null });

        const req = new Request('http://localhost/api/admin/pipeline/export?status=enriched&search=test');
        await GET(req);

        expect(mockEq).toHaveBeenCalledWith('pipeline_status', 'enriched');
        expect(mockOr).toHaveBeenCalledWith(expect.stringContaining('test'));
    });
});
