/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FloatingActionsBar } from '@/components/admin/pipeline/FloatingActionsBar';
import { PipelineClient } from '@/components/admin/pipeline/PipelineClient';
import type { StatusCount } from '@/lib/pipeline/types';

const mockSearchParamGet = jest.fn();
const mockSearchParamsToString = jest.fn(() => '');
const mockReplace = jest.fn();
const mockFetch = jest.fn();
const mockRouter = { replace: mockReplace };
const mockSearchParams = {
    get: mockSearchParamGet,
    toString: mockSearchParamsToString,
};

global.fetch = mockFetch as typeof fetch;

jest.mock('next/dynamic', () => () => {
    const DynamicMock = () => null;
    DynamicMock.displayName = 'DynamicMock';
    return DynamicMock;
});

jest.mock('next/navigation', () => ({
    useRouter: () => mockRouter,
    usePathname: () => '/admin/pipeline',
    useSearchParams: () => mockSearchParams,
}));

jest.mock('@/components/admin/pipeline/StageTabs', () => ({
    StageTabs: ({ actions }: { actions?: ReactNode }) => (
        <div>
            <div data-testid="stage-tabs" />
            {actions}
        </div>
    ),
}));

jest.mock('@/components/admin/pipeline/ProductTable', () => ({
    ProductTable: () => <div data-testid="product-table" />,
}));
jest.mock('@/components/admin/pipeline/ScrapedResultsView', () => ({
    ScrapedResultsView: () => <div data-testid="scraped-results" />,
}));
jest.mock('@/components/admin/pipeline/ActiveRunsTab', () => ({
    ActiveRunsTab: () => <div data-testid="active-runs" />,
}));
jest.mock('@/components/admin/pipeline/ActiveConsolidationsTab', () => ({
    ActiveConsolidationsTab: () => <div data-testid="active-consolidations" />,
}));
jest.mock('@/components/admin/pipeline/FinalizingResultsView', () => ({
    FinalizingResultsView: () => <div data-testid="finalizing-results" />,
}));

const counts: StatusCount[] = [
    { status: 'imported', count: 0 },
    { status: 'scraping', count: 0 },
    { status: 'scraped', count: 0 },
    { status: 'consolidating', count: 0 },
    { status: 'finalizing', count: 0 },
    { status: 'exporting', count: 2 },
    { status: 'failed', count: 0 },
];

describe('export tab actions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSearchParamsToString.mockReturnValue('');
        mockSearchParamGet.mockImplementation((key: string) => key === 'stage' ? 'exporting' : null);
        mockFetch.mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);

            if (url.includes('/api/admin/pipeline/upload-shopsite')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ uploadedCount: 2, uploadedSkus: ['SKU001', 'SKU002'] }),
                });
            }

            if (url.includes('/api/admin/pipeline/export-xml')) {
                return Promise.resolve({
                    ok: true,
                    blob: async () => new Blob(['xml']),
                    headers: { get: () => 'attachment; filename="shopsite-products.xml"' },
                });
            }

            if (url.includes('/api/admin/pipeline/export-zip')) {
                return Promise.resolve({
                    ok: true,
                    blob: async () => new Blob(['zip']),
                    headers: { get: () => 'attachment; filename="shopsite-images.zip"' },
                });
            }

            if (url.includes('/api/admin/pipeline/export?status=exporting') || url.endsWith('/api/admin/pipeline/export')) {
                return Promise.resolve({
                    ok: true,
                    blob: async () => new Blob(['xlsx']),
                    headers: { get: () => 'attachment; filename="products-export.xlsx"' },
                });
            }

            return Promise.resolve({
                ok: true,
                json: async () => ({ counts, products: [], count: 2, availableSources: [] }),
            });
        });

        window.URL.createObjectURL = jest.fn(() => 'blob:mock');
        window.URL.revokeObjectURL = jest.fn();
        HTMLAnchorElement.prototype.click = jest.fn();
    });

    it('renders exporting-stage workspace actions when nothing is selected', async () => {
        render(
            <PipelineClient
                initialCounts={counts}
                initialProducts={[]}
                initialTotal={2}
                initialStage="exporting"
                initialSources={[]}
            />,
        );

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: 'Upload to ShopSite' }),
            ).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Upload to ShopSite' }));

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/admin/pipeline/upload-shopsite',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({}),
                }),
            );
        });

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: 'Export ShopSite XML' }),
            ).toBeEnabled();
        });

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/admin/pipeline/export-zip',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        skus: ['SKU001', 'SKU002'],
                        includeExportedSelection: true,
                    }),
                }),
            );
        });

        fireEvent.click(screen.getByRole('button', { name: 'Export ShopSite XML' }));
        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/admin/pipeline/export-xml',
            );
        });

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: 'Export Excel' }),
            ).toBeEnabled();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith('/api/admin/pipeline/export?status=exporting');
        });

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: 'Download Images ZIP' }),
            ).toBeEnabled();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Download Images ZIP' }));
        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith('/api/admin/pipeline/export-zip');
        });
    });

    it('renders selected export actions in the exporting floating action bar', () => {
        const onUploadShopSite = jest.fn();
        const onDownloadZip = jest.fn();

        render(
                <FloatingActionsBar
                    selectedCount={3}
                    totalCount={12}
                    currentStage="exporting"
                    isLoading={false}
                onClearSelection={() => {}}
                onSelectAll={() => {}}
                onBulkAction={() => {}}
                onDelete={() => {}}
                onUploadShopSite={onUploadShopSite}
                onDownloadZip={onDownloadZip}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Upload to ShopSite' }));
        fireEvent.click(screen.getByRole('button', { name: 'Download ZIP' }));

        expect(onUploadShopSite).toHaveBeenCalledTimes(1);
        expect(onDownloadZip).toHaveBeenCalledTimes(1);
    });
});
