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
jest.mock('@/components/admin/pipeline/ReviewingResultsView', () => ({
    ReviewingResultsView: () => <div data-testid="reviewing-results" />,
}));

const counts: StatusCount[] = [
    { status: 'imported', count: 0 },
    { status: 'awaiting_brand', count: 0 },
    { status: 'extracting', count: 0 },
    { status: 'processed', count: 0 },
    { status: 'merging', count: 0 },
    { status: 'reviewing', count: 0 },
    { status: 'publishing', count: 2 },
    { status: 'failed', count: 0 },
];

describe('export tab actions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSearchParamsToString.mockReturnValue('');
        mockSearchParamGet.mockImplementation((key: string) => key === 'stage' ? 'publishing' : null);
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

            if (url.includes('/api/admin/pipeline/export?status=publishing') || url.endsWith('/api/admin/pipeline/export')) {
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

    it('does not render top bar actions in publishing stage when nothing is selected', async () => {
        render(
            <PipelineClient
                initialCounts={counts}
                initialProducts={[]}
                initialTotal={2}
                initialStage="publishing"
                initialSources={[]}
            />,
        );

        // Top bar should be empty for publishing stage now (except for tabs)
        expect(screen.queryByRole('button', { name: 'Upload to ShopSite' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Export ShopSite XML' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Export Excel' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Download Images ZIP' })).not.toBeInTheDocument();
    });

    it('renders selected export actions in the publishing floating action bar', () => {
        const onUploadShopSite = jest.fn();
        const onDownloadZip = jest.fn();

        render(
                <FloatingActionsBar
                    selectedCount={3}
                    totalCount={12}
                    currentStage="publishing"
                    isLoading={false}
                onClearSelection={() => {}}
                onSelectAll={() => {}}
                onBulkAction={() => {}}
                onDelete={() => {}}
                onUploadShopSite={onUploadShopSite}
                onDownloadZip={onDownloadZip}
                showLegacyShopSiteActions
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
        fireEvent.click(screen.getByRole('button', { name: 'Download zip' }));

        expect(onUploadShopSite).toHaveBeenCalledTimes(1);
        expect(onDownloadZip).toHaveBeenCalledTimes(1);
    });
});
