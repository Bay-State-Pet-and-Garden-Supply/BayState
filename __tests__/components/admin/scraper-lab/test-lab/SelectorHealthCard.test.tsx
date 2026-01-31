/**
 * SelectorHealthCard Tests
 */

import { render, screen } from '@testing-library/react';
import { SelectorHealthCard } from '@/components/admin/scraper-lab/test-lab/SelectorHealthCard';

describe('SelectorHealthCard', () => {
    const defaultProps = {
        scraperName: 'amazon',
        sku: 'B001234567',
        selectorEvents: [],
    };

    it('renders selector health card', () => {
        render(<SelectorHealthCard {...defaultProps} />);

        expect(screen.getByText('Selector Health')).toBeInTheDocument();
        expect(screen.getByText('amazon / SKU: B001234567')).toBeInTheDocument();
    });

    it('shows 0% health when no events', () => {
        render(<SelectorHealthCard {...defaultProps} />);

        expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('calculates health score correctly', () => {
        render(
            <SelectorHealthCard
                {...defaultProps}
                selectorEvents={[
                    {
                        selector_name: 'title',
                        selector_value: '.title',
                        status: 'FOUND',
                        timestamp: new Date().toISOString(),
                    },
                    {
                        selector_name: 'price',
                        selector_value: '.price',
                        status: 'MISSING',
                        timestamp: new Date().toISOString(),
                    },
                ]}
            />
        );

        // 1 found out of 2 = 50%
        expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('shows all selector events', () => {
        render(
            <SelectorHealthCard
                {...defaultProps}
                selectorEvents={[
                    {
                        selector_name: 'title',
                        selector_value: '.title',
                        status: 'FOUND',
                        timestamp: new Date().toISOString(),
                    },
                    {
                        selector_name: 'price',
                        selector_value: '.price',
                        status: 'FOUND',
                        timestamp: new Date().toISOString(),
                    },
                ]}
            />
        );

        expect(screen.getByText('title')).toBeInTheDocument();
        expect(screen.getByText('price')).toBeInTheDocument();
    });

    it('displays no events message when empty', () => {
        render(<SelectorHealthCard {...defaultProps} />);

        expect(screen.getByText('No selector validation events yet')).toBeInTheDocument();
    });
});
