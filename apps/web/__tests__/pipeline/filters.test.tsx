import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PipelineFilters } from '@/components/admin/pipeline/PipelineFilters';
import { PipelineClient } from '@/components/admin/pipeline/PipelineClient';
import userEvent from '@testing-library/user-event';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSearchParamGet = jest.fn();
const mockSearchParamsToString = jest.fn(() => '');
const mockRouter = {
    push: mockPush,
    replace: mockReplace,
};
const mockSearchParams = {
    get: mockSearchParamGet,
    toString: mockSearchParamsToString,
};

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter: () => mockRouter,
    usePathname: () => '/admin/pipeline',
    useSearchParams: () => mockSearchParams,
}));

// Mock lib/pipeline-scraping
jest.mock('@/lib/pipeline-scraping', () => ({
    checkRunnersAvailable: jest.fn(() => Promise.resolve(true)),
    scrapeProducts: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
    })
) as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamGet.mockReturnValue(null);
    mockSearchParamsToString.mockReturnValue('');
    (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ products: [], count: 0 }),
        })
    );
});

describe('PipelineFilters', () => {
    it('renders filter button', () => {
        render(
            <PipelineFilters
                filters={{}}
                onFilterChange={jest.fn()}
            />
        );
        expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('opens popover and shows filter options', async () => {
        render(
            <PipelineFilters
                filters={{}}
                onFilterChange={jest.fn()}
                availableSources={['scraper-1']}
                showSourceFilter
            />
        );

        fireEvent.click(screen.getByRole('button'));

        expect(screen.getByLabelText('Source')).toBeInTheDocument();
        expect(screen.getByLabelText('Product line')).toBeInTheDocument();
        expect(screen.getByLabelText('Batch ID')).toBeInTheDocument();
        expect(screen.queryByText('Date Range (Updated)')).not.toBeInTheDocument();
        expect(screen.queryByText('Confidence Score')).not.toBeInTheDocument();
    });

    it('calls onFilterChange when applying filters', async () => {
        const onFilterChange = jest.fn();
        render(
            <PipelineFilters
                filters={{}}
                onFilterChange={onFilterChange}
                availableSources={['scraper-1']}
                showSourceFilter
            />
        );

        fireEvent.click(screen.getByRole('button'));

        fireEvent.click(screen.getByRole('combobox', { name: 'Source' }));
        fireEvent.click(screen.getByText('scraper-1'));

        // Click Apply
        fireEvent.click(screen.getByText('Apply filters'));

        expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({
            source: 'scraper-1'
        }));
    });
});

describe('PipelineClient Integration', () => {
    const mockProducts = [
        {
            sku: 'TEST-1',
            pipeline_status: 'imported',
            sources: {},
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            input: { name: 'Test Product', price: 10 },
            consolidated: null,
        }
    ];
    const mockCounts = [{ status: 'imported', count: 1 }];

    it('updates the stage in the URL when the active stage changes', async () => {
        mockSearchParamsToString.mockReturnValue('stage=scraped&search=seed&source=scraper-1&product_line=Seeds&cohort_id=batch-123');
        mockSearchParamGet.mockImplementation((key: string) => {
            const values: Record<string, string | null> = {
                stage: 'scraped',
                search: 'seed',
                source: 'scraper-1',
                product_line: 'Seeds',
                cohort_id: 'batch-123',
            };

            return values[key] ?? null;
        });

        render(
            <PipelineClient
                initialProducts={mockProducts as any}
                initialCounts={mockCounts as any}
                initialTotal={1}
                initialStage="scraped"
                initialSources={['scraper-1']}
            />
        );

        fireEvent.click(screen.getByRole('tab', { name: /Finalizing/i }));

        await waitFor(() => {
            expect(mockReplace).toHaveBeenCalledWith('/admin/pipeline?stage=finalizing');
        });
    });
});
