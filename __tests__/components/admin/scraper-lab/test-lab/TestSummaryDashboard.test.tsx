/**
 * TestSummaryDashboard Tests
 */

import { render, screen } from '@testing-library/react';
import { TestSummaryDashboard } from '@/components/admin/scraper-lab/test-lab/TestSummaryDashboard';

describe('TestSummaryDashboard', () => {
    const defaultProps = {
        summary: {
            testRunId: 'test-123',
            scraperName: 'amazon',
            status: 'running',
            startedAt: new Date().toISOString(),
            selectorTotal: 10,
            selectorSuccess: 8,
            selectorFailed: 2,
            extractionTotal: 5,
            extractionSuccess: 4,
            extractionFailed: 1,
            healthScore: 80,
        },
    };

    it('renders test summary dashboard', () => {
        render(<TestSummaryDashboard {...defaultProps} />);

        expect(screen.getByText('Test Summary')).toBeInTheDocument();
        expect(screen.getByText('amazon / Run ID: test-123')).toBeInTheDocument();
    });

    it('shows health score', () => {
        render(<TestSummaryDashboard {...defaultProps} />);

        expect(screen.getByText('80%')).toBeInTheDocument();
    });

    it('shows running status', () => {
        render(<TestSummaryDashboard {...defaultProps} />);

        expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('displays selector stats', () => {
        render(<TestSummaryDashboard {...defaultProps} />);

        expect(screen.getByText('8/10')).toBeInTheDocument();
        expect(screen.getByText('2 failed')).toBeInTheDocument();
    });

    it('displays extraction stats', () => {
        render(<TestSummaryDashboard {...defaultProps} />);

        expect(screen.getByText('4/5')).toBeInTheDocument();
        expect(screen.getByText('1 failed')).toBeInTheDocument();
    });

    it('shows login status when available', () => {
        render(
            <TestSummaryDashboard
                {...defaultProps}
                summary={{
                    ...defaultProps.summary,
                    loginStatus: 'SUCCESS',
                }}
            />
        );

        expect(screen.getByText('SUCCESS')).toBeInTheDocument();
    });

    it('displays duration', () => {
        render(
            <TestSummaryDashboard
                {...defaultProps}
                summary={{
                    ...defaultProps.summary,
                    durationMs: 65000,
                }}
            />
        );

        expect(screen.getByText('1m 5s')).toBeInTheDocument();
    });

    it('shows completed status', () => {
        render(
            <TestSummaryDashboard
                {...defaultProps}
                summary={{
                    ...defaultProps.summary,
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                }}
            />
        );

        expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('shows failed status', () => {
        render(
            <TestSummaryDashboard
                {...defaultProps}
                summary={{
                    ...defaultProps.summary,
                    status: 'failed',
                }}
            />
        );

        expect(screen.getByText('Failed')).toBeInTheDocument();
    });
});
