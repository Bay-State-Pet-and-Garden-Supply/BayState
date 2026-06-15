/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { PipelineSidebarTable } from '@/components/admin/pipeline/PipelineSidebarTable';
import type { PipelineProduct } from '@/lib/pipeline/types';

jest.mock('@/components/admin/pipeline/VirtualizedPipelineTable', () => ({
  VirtualizedPipelineTable: ({ items, renderRow }: { items: unknown[]; renderRow: (item: unknown, index: number, virtualRow: { key: string; index: number }) => React.ReactNode }) => (
    <table data-testid="virtualized-pipeline-table-mock">
      <tbody>
        {items.map((item, index) => renderRow(item, index, { key: `row-${index}`, index }))}
      </tbody>
    </table>
  ),
}));

function makeProduct(upc: string): PipelineProduct {
  return {
    upc,
    input: { name: `Product ${upc}`, price: 10 },
    sources: {},
    consolidated: { name: `Product ${upc}`, price: 10 },
    pipeline_status: 'processed',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('PipelineSidebarTable', () => {
  it('renders products in a flat sidebar list', () => {
    render(
      <PipelineSidebarTable
        products={[makeProduct('UPC001'), makeProduct('UPC002')]}
        selectedUpcs={new Set()}
        preferredUpc={null}
        onSelectUpc={jest.fn()}
        onSelectAll={jest.fn()}
        onDeselectAll={jest.fn()}
        onPreferredUpcChange={jest.fn()}
        variant="processed"
      />
    );

    expect(screen.getByText('UPC001')).toBeInTheDocument();
    expect(screen.getByText('UPC002')).toBeInTheDocument();
  });

  it('selects a product through its row checkbox', () => {
    const onSelectUpc = jest.fn();

    render(
      <PipelineSidebarTable
        products={[makeProduct('UPC001')]}
        selectedUpcs={new Set()}
        preferredUpc={null}
        onSelectUpc={onSelectUpc}
        onSelectAll={jest.fn()}
        onDeselectAll={jest.fn()}
        onPreferredUpcChange={jest.fn()}
        variant="processed"
      />
    );

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onSelectUpc).toHaveBeenCalledWith('UPC001', true, 0, false, [expect.objectContaining({ upc: 'UPC001' })]);
  });
});
