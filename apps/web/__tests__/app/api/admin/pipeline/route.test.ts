import { PERSISTED_PIPELINE_STATUSES } from '@/lib/pipeline/types';

const {
    NextRequest,
    requireAdminAuth,
} = require('@/__tests__/helpers/admin-api-route-harness');
const { GET, POST } = require('@/app/api/admin/pipeline/route');

jest.mock('@/lib/pipeline', () => ({
    getProductsByStatus: jest.fn(),
    getProductsByStage: jest.fn(),
    getUpcsByStatus: jest.fn(),
    getUpcsByStage: jest.fn(),
    getAvailableSources: jest.fn(),
    getAvailableSourcesByStage: jest.fn(),
    bulkUpdateStatus: jest.fn(),
}));

const { getProductsByStatus, getUpcsByStatus, getAvailableSources, bulkUpdateStatus } = require('@/lib/pipeline');

const CANONICAL_STATUS_LIST = PERSISTED_PIPELINE_STATUSES.map(
    (status) => `'${status}'`
).join(', ');

describe('/api/admin/pipeline route', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 'admin-1' } });
        (getAvailableSources as jest.Mock).mockResolvedValue([]);
    });

    it('lists canonical statuses with the requested filters', async () => {
        (getProductsByStatus as jest.Mock).mockResolvedValue({
            products: [{ upc: 'UPC-1', pipeline_status: 'processed' }],
            count: 1,
        });

        const response = await GET(
            new NextRequest(
                'http://localhost/api/admin/pipeline?status=processed&search=hero&limit=25&offset=5&source=amazon&startDate=2026-01-01&endDate=2026-01-31&minConfidence=0.4&maxConfidence=0.9'
            )
        );
        const payload = await response.json();

        expect(getProductsByStatus).toHaveBeenCalledWith('processed', {
            limit: 25,
            offset: 5,
            search: 'hero',
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            source: 'amazon',
            product_line: undefined,
            minConfidence: 0.4,
            maxConfidence: 0.9,
        });
        expect(payload).toEqual({
            products: [{ upc: 'UPC-1', pipeline_status: 'processed' }],
            count: 1,
            availableSources: [],
        });
    });

    it('uses canonical status filtering for select-all requests', async () => {
        (getUpcsByStatus as jest.Mock).mockResolvedValue({
            upcs: ['UPC-1', 'UPC-2'],
            count: 2,
        });

        const response = await GET(
            new NextRequest('http://localhost/api/admin/pipeline?status=reviewing&selectAll=true&source=chewy')
        );
        const payload = await response.json();

        expect(getUpcsByStatus).toHaveBeenCalledWith('reviewing', {
            search: undefined,
            startDate: undefined,
            endDate: undefined,
            source: 'chewy',
            product_line: undefined,
            minConfidence: undefined,
            maxConfidence: undefined,
        });
        expect(payload).toEqual({ upcs: ['UPC-1', 'UPC-2'], count: 2 });
    });

    it('rejects legacy status filters at the route boundary', async () => {
        const response = await GET(new NextRequest('http://localhost/api/admin/pipeline?status=consolidated'));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(getProductsByStatus).not.toHaveBeenCalled();
        expect(payload).toEqual({
            error: `Invalid status 'consolidated'. Allowed persisted statuses: ${CANONICAL_STATUS_LIST}`,
        });
    });

    it('rejects derived publish status updates at the mutation boundary', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline', {
                body: JSON.stringify({ upcs: ['UPC-1'], newStatus: 'published' }),
            } as any)
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(bulkUpdateStatus).not.toHaveBeenCalled();
        expect(payload).toEqual({
            error: "Published is no longer a workflow state. Use reviewing/publishing instead.",
        });
    });
});
