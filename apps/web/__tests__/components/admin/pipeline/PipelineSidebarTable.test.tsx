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

function makeProduct(sku: string, cohortId: string, cohortName: string): PipelineProduct {
  return {
    sku,
    input: { name: `Product ${sku}`, price: 10 },
    sources: {},
    consolidated: { name: `Product ${sku}`, price: 10 },
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
      makeProduct('SKU001', 'cohort-1', 'Test Batch'),
      makeProduct('SKU002', 'cohort-1', 'Test Batch'),
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
        selectedSkus={new Set()}
        preferredSku={null}
        onSelectSku={jest.fn()}
        onSelectAll={onSelectAll}
        onDeselectAll={jest.fn()}
        onPreferredSkuChange={jest.fn()}
        variant="imported"
      />
    );

    expect(screen.queryByText('SKU001')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onSelectAll).toHaveBeenCalledWith(['SKU001', 'SKU002']);
  });
});
