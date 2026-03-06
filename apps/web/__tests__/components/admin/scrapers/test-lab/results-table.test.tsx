import { render, screen, fireEvent } from '@testing-library/react';
import { ResultsTable } from '@/components/admin/scrapers/test-lab/results-table';
import { SkuResult } from '@/components/admin/scrapers/test-lab/results-panel';

const mockResults: SkuResult[] = [
  {
    sku: 'TEST-SKU-1',
    status: 'success',
    duration_ms: 1200,
    telemetry: {
      selectors: [
        { selector_name: 'price', selector_value: '$10.00', status: 'FOUND' },
        { selector_name: 'title', selector_value: 'Test Product', status: 'FOUND' },
      ],
      extractions: [
        { field_name: 'price', field_value: '10.00', status: 'SUCCESS' },
      ]
    }
  },
  {
    sku: 'TEST-SKU-2',
    status: 'failed',
    error: 'Selector not found',
    telemetry: {
      selectors: [
        { selector_name: 'price', selector_value: '', status: 'MISSING' },
      ],
      extractions: []
    }
  }
];

describe('ResultsTable', () => {
  it('renders a table with SKU results', () => {
    render(<ResultsTable results={mockResults} />);
    
    expect(screen.getByText('TEST-SKU-1')).toBeInTheDocument();
    expect(screen.getByText('TEST-SKU-2')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows sparklines for health', () => {
    render(<ResultsTable results={mockResults} />);
    // We expect some element representing a sparkline
    expect(screen.getAllByTestId('sparkline').length).toBeGreaterThan(0);
  });

  it('opens details when a row is clicked', () => {
    render(<ResultsTable results={mockResults} />);
    
    const firstRow = screen.getByText('TEST-SKU-1').closest('tr');
    if (!firstRow) throw new Error('Row not found');
    
    fireEvent.click(firstRow);
    
    // Check for detail content (this might be in a drawer or expanded row)
    expect(screen.getByText('Extraction Results')).toBeInTheDocument();
    expect(screen.getByText('Selector Health')).toBeInTheDocument();
  });
});
