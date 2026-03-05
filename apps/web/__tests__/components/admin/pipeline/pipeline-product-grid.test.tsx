import { render, screen } from '@testing-library/react';
import { PipelineProductGrid } from '@/components/admin/pipeline/PipelineProductGrid';
import type { PipelineProduct } from '@/lib/pipeline';

const mockProducts: PipelineProduct[] = [
  {
    sku: 'SKU001',
    input: { name: 'Product 1', price: 10.99 },
    sources: {},
    consolidated: { name: 'Product 1', price: 10.99 },
    pipeline_status: 'staging',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
  {
    sku: 'SKU002',
    input: { name: 'Product 2', price: 20.99 },
    sources: {},
    consolidated: { name: 'Product 2', price: 20.99 },
    pipeline_status: 'scraped',
    created_at: '2024-01-02',
    updated_at: '2024-01-02',
  },
];

jest.mock('@/components/admin/pipeline/PipelineProductCard', () => ({
  PipelineProductCard: ({ product, isSelected }: { product: PipelineProduct; isSelected: boolean }) => (
    <div data-testid="product-card" data-selected={isSelected}>
      {product.sku}
    </div>
  ),
}));

describe('PipelineProductGrid', () => {
  const defaultProps = {
    products: [],
    selectedSkus: new Set<string>(),
    onSelect: jest.fn(),
    onView: jest.fn(),
    loading: false,
    hasMore: false,
    onLoadMore: jest.fn(),
  };

  it('renders loading spinner when loading and no products', () => {
    render(<PipelineProductGrid {...defaultProps} loading={true} products={[]} />);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders empty state when no products', () => {
    render(<PipelineProductGrid {...defaultProps} products={[]} />);

    expect(screen.getByText('No products available.')).toBeInTheDocument();
  });

  it('renders custom empty message', () => {
    render(
      <PipelineProductGrid
        {...defaultProps}
        products={[]}
        emptyMessage="No items found"
      />
    );

    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('renders products in grid', () => {
    render(
      <PipelineProductGrid
        {...defaultProps}
        products={mockProducts}
      />
    );

    expect(screen.getAllByTestId('product-card')).toHaveLength(2);
  });

  it('shows selected state correctly', () => {
    render(
      <PipelineProductGrid
        {...defaultProps}
        products={mockProducts}
        selectedSkus={new Set(['SKU001'])}
      />
    );

    const cards = screen.getAllByTestId('product-card');
    expect(cards[0]).toHaveAttribute('data-selected', 'true');
    expect(cards[1]).toHaveAttribute('data-selected', 'false');
  });

  it('renders Load More button when hasMore is true', () => {
    render(
      <PipelineProductGrid
        {...defaultProps}
        products={mockProducts}
        hasMore={true}
      />
    );

    expect(screen.getByText('Load More')).toBeInTheDocument();
  });

  it('does not render Load More button when hasMore is false', () => {
    render(
      <PipelineProductGrid
        {...defaultProps}
        products={mockProducts}
        hasMore={false}
      />
    );

    expect(screen.queryByText('Load More')).not.toBeInTheDocument();
  });

  it('shows Loading state when hasMore and loading', () => {
    render(
      <PipelineProductGrid
        {...defaultProps}
        products={mockProducts}
        hasMore={true}
        loading={true}
      />
    );

    const button = screen.getByText('Loading...') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('calls onLoadMore when Load More is clicked', () => {
    const onLoadMore = jest.fn();
    render(
      <PipelineProductGrid
        {...defaultProps}
        products={mockProducts}
        hasMore={true}
        onLoadMore={onLoadMore}
      />
    );

    fireEvent.click(screen.getByText('Load More'));
    expect(onLoadMore).toHaveBeenCalled();
  });
});

import { fireEvent } from '@testing-library/react';
