import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PipelineFilters } from '@/components/admin/pipeline/PipelineFilters';
import { PipelineClient } from '@/components/admin/pipeline/PipelineClient';
import userEvent from '@testing-library/user-event';

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
    }),
    usePathname: () => '/admin/pipeline',
    useSearchParams: () => ({
        get: jest.fn(),
    }),
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

describe('PipelineFilters', () => {
    it('renders filter button', () => {
        render(
            <PipelineFilters
                filters={{}}
                onFilterChange={jest.fn()}
            />
        );
        expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('opens popover and shows filter options', async () => {
        render(
            <PipelineFilters
                filters={{}}
                onFilterChange={jest.fn()}
            />
        );

        fireEvent.click(screen.getByText('Filters'));

        expect(screen.getByText('Date Range (Updated)')).toBeInTheDocument();
        expect(screen.getByLabelText('Source')).toBeInTheDocument();
        expect(screen.getByText('Confidence Score')).toBeInTheDocument();
    });

    it('calls onFilterChange when applying filters', async () => {
        const onFilterChange = jest.fn();
        render(
            <PipelineFilters
                filters={{}}
                onFilterChange={onFilterChange}
            />
        );

        fireEvent.click(screen.getByText('Filters'));
        
        // Type in source
        const sourceInput = screen.getByLabelText('Source');
        fireEvent.change(sourceInput, { target: { value: 'scraper-1' } });

        // Click Apply
        fireEvent.click(screen.getByText('Apply Filters'));

        expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({
            source: 'scraper-1'
        }));
    });
});

describe('PipelineClient Integration', () => {
    const mockProducts = [
        { sku: 'TEST-1', pipeline_status: 'staging', sources: {}, created_at: '', updated_at: '', input: {}, consolidated: {} }
    ];
    const mockCounts = [{ status: 'staging', count: 1 }];

    it('updates URL and fetches data when filters change', async () => {
        render(
            <PipelineClient
                initialProducts={mockProducts as any}
                initialCounts={mockCounts as any}
                initialStatus="staging"
            />
        );

        // Open filters
        fireEvent.click(screen.getByText('Filters'));

        // Set source
        const sourceInput = screen.getByLabelText('Source');
        fireEvent.change(sourceInput, { target: { value: 'test-source' } });

        // Apply
        fireEvent.click(screen.getByText('Apply Filters'));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('source=test-source')
            );
        });
    });
});
