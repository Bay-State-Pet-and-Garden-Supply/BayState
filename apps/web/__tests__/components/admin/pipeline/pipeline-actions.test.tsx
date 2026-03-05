import { render, screen, fireEvent } from '@testing-library/react';
import { PipelineActions } from '@/components/admin/pipeline/PipelineActions';

describe('PipelineActions', () => {
  const defaultProps = {
    selectedCount: 0,
    selectedSkus: [],
    currentStatus: 'staging',
    onApprove: jest.fn(),
    onReject: jest.fn(),
    onDelete: jest.fn(),
    onClear: jest.fn(),
  };

  it('renders nothing when no products selected', () => {
    const { container } = render(<PipelineActions {...defaultProps} selectedCount={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders selection count when products are selected', () => {
    render(<PipelineActions {...defaultProps} selectedCount={3} />);

    expect(screen.getByText('3 products selected')).toBeInTheDocument();
  });

  it('renders singular form when one product selected', () => {
    render(<PipelineActions {...defaultProps} selectedCount={1} />);

    expect(screen.getByText('1 product selected')).toBeInTheDocument();
  });

  it('calls onApprove when Approve button is clicked', () => {
    const onApprove = jest.fn();
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        onApprove={onApprove}
      />
    );

    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalled();
  });

  it('calls onReject when Reject button is clicked', () => {
    const onReject = jest.fn();
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        onReject={onReject}
      />
    );

    fireEvent.click(screen.getByText('Reject'));
    expect(onReject).toHaveBeenCalled();
  });

  it('calls onDelete when Delete button is clicked', () => {
    const onDelete = jest.fn();
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('calls onClear when Clear button is clicked', () => {
    const onClear = jest.fn();
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        onClear={onClear}
      />
    );

    fireEvent.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows loading state for Approve button', () => {
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        loading={{ approve: true }}
      />
    );

    expect(screen.getByText('Approving...')).toBeInTheDocument();
  });

  it('shows loading state for Reject button', () => {
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        loading={{ reject: true }}
      />
    );

    expect(screen.getByText('Rejecting...')).toBeInTheDocument();
  });

  it('shows loading state for Delete button', () => {
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        loading={{ delete: true }}
      />
    );

    expect(screen.getByText('Deleting...')).toBeInTheDocument();
  });

  it('disables action buttons when approve is loading', () => {
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        loading={{ approve: true }}
      />
    );

    const approveButton = screen.getByText('Approving...').closest('button');
    expect(approveButton).toBeDisabled();
  });

  it('disables Clear button when any action is loading', () => {
    const onClear = jest.fn();
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        loading={{ approve: true }}
        onClear={onClear}
      />
    );

    const clearButton = screen.getByText('Clear').closest('button');
    expect(clearButton).toBeDisabled();
  });

  it('disables Clear button when reject is loading', () => {
    const onClear = jest.fn();
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        loading={{ reject: true }}
        onClear={onClear}
      />
    );

    const clearButton = screen.getByText('Clear').closest('button');
    expect(clearButton).toBeDisabled();
  });

  it('disables Clear button when delete is loading', () => {
    const onClear = jest.fn();
    render(
      <PipelineActions
        {...defaultProps}
        selectedCount={2}
        loading={{ delete: true }}
        onClear={onClear}
      />
    );

    const clearButton = screen.getByText('Clear').closest('button');
    expect(clearButton).toBeDisabled();
  });
});
