/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { PipelineActions } from '@/components/admin/pipeline/PipelineActions';

describe('PipelineActions', () => {
    const defaultProps = {
        selectedCount: 0,
        selectedUpcs: [],
        currentStatus: 'imported',
        onApprove: jest.fn(),
        onReject: jest.fn(),
        onDelete: jest.fn(),
        onClear: jest.fn(),
    };

    it('renders nothing when no items are selected', () => {
        const { container } = render(<PipelineActions {...defaultProps} selectedCount={0} />);
        expect(container.firstChild).toBeNull();
    });

    it('displays the selected count', () => {
        render(<PipelineActions {...defaultProps} selectedCount={3} />);
        expect(screen.getByText('3 products selected')).toBeInTheDocument();
    });

    it('displays singular count correctly', () => {
        render(<PipelineActions {...defaultProps} selectedCount={1} />);
        expect(screen.getByText('1 product selected')).toBeInTheDocument();
    });

    it('shows loading state for approve action', () => {
        render(
            <PipelineActions
                {...defaultProps}
                selectedCount={1}
                loading={{ approve: true }}
            />
        );
        expect(screen.getByText('Approving…')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Approving…' })).toBeDisabled();
    });

    it('shows loading state for reject action', () => {
        render(
            <PipelineActions
                {...defaultProps}
                selectedCount={1}
                loading={{ reject: true }}
            />
        );
        expect(screen.getByText('Rejecting…')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Rejecting…' })).toBeDisabled();
    });

    it('shows loading state for delete action', () => {
        render(
            <PipelineActions
                {...defaultProps}
                selectedCount={1}
                loading={{ delete: true }}
            />
        );
        expect(screen.getByText('Deleting…')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    });
});
