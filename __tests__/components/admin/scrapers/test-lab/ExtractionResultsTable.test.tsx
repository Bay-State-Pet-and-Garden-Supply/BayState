/**
 * ExtractionResultsTable Tests
 */

import { render, screen } from '@testing-library/react';
import { ExtractionResultsTable } from '@/components/admin/scrapers/test-lab/ExtractionResultsTable';

describe('ExtractionResultsTable', () => {
    const defaultProps = {
        scraperName: 'amazon',
        sku: 'B001234567',
        extractionEvents: [],
    };

    it('renders extraction results table', () => {
        render(<ExtractionResultsTable {...defaultProps} />);

        expect(screen.getByText('Extraction Results')).toBeInTheDocument();
        expect(screen.getByText('amazon / SKU: B001234567')).toBeInTheDocument();
    });

    it('shows no results message when empty', () => {
        render(<ExtractionResultsTable {...defaultProps} />);

        expect(screen.getByText('No extraction results yet')).toBeInTheDocument();
    });

    it('displays extraction events in table', () => {
        render(
            <ExtractionResultsTable
                {...defaultProps}
                extractionEvents={[
                    {
                        field_name: 'price',
                        field_value: '$99.99',
                        status: 'SUCCESS',
                        timestamp: new Date().toISOString(),
                    },
                    {
                        field_name: 'brand',
                        field_value: 'TestBrand',
                        status: 'SUCCESS',
                        timestamp: new Date().toISOString(),
                    },
                ]}
            />
        );

        expect(screen.getByText('price')).toBeInTheDocument();
        expect(screen.getByText('$99.99')).toBeInTheDocument();
        expect(screen.getByText('brand')).toBeInTheDocument();
        expect(screen.getByText('TestBrand')).toBeInTheDocument();
    });

    it('shows failed extractions', () => {
        render(
            <ExtractionResultsTable
                {...defaultProps}
                extractionEvents={[
                    {
                        field_name: 'rating',
                        status: 'NOT_FOUND',
                        timestamp: new Date().toISOString(),
                    },
                ]}
            />
        );

        expect(screen.getByText('rating')).toBeInTheDocument();
        expect(screen.getByText('NOT_FOUND')).toBeInTheDocument();
    });

    it('shows empty value for EMPTY status', () => {
        render(
            <ExtractionResultsTable
                {...defaultProps}
                extractionEvents={[
                    {
                        field_name: 'description',
                        status: 'EMPTY',
                        timestamp: new Date().toISOString(),
                    },
                ]}
            />
        );

        expect(screen.getByText('description')).toBeInTheDocument();
        expect(screen.getByText('(empty)')).toBeInTheDocument();
    });
});
