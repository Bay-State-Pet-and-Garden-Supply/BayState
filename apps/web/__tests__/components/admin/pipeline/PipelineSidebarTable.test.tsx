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

function makeProduct(upc: string, cohortId: string, cohortName: string): PipelineProduct {
  return {
    upc,
    input: { name: `Product ${upc}`, price: 10 },
    sources: {},
    consolidated: { name: `Product ${upc}`, price: 10 },
    pipeline_status: 'imported',
    cohort_id: cohortId,
    cohort_name: cohortName,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('PipelineSidebarTable', () => {
  it('selects an entire collapsed imported cohort from its header checkbox', () => {
    const products = [
      makeProduct('UPC001', 'cohort-1', 'Test Batch'),
      makeProduct('UPC002', 'cohort-1', 'Test Batch'),
    ];
    const onSelectAll = jest.fn();

    render(
      <PipelineSidebarTable
        products={products}
        groupedProducts={{
          groups: { 'cohort-1': products },
          cohortIds: ['cohort-1'],
          names: { 'cohort-1': 'Test Batch' },
        }}
        selectedUpcs={new Set()}
        preferredUpc={null}
        onSelectUpc={jest.fn()}
        onSelectAll={onSelectAll}
        onDeselectAll={jest.fn()}
        onPreferredUpcChange={jest.fn()}
        variant="imported"
      />
    );

    expect(screen.queryByText('UPC001')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onSelectAll).toHaveBeenCalledWith(['UPC001', 'UPC002']);
  });
});
