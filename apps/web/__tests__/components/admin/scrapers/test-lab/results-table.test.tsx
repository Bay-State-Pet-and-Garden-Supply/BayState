import { render, screen, fireEvent } from '@testing-library/react';
import { ResultsTable } from '@/components/admin/scrapers/test-lab/results-table';
import { SkuResult } from '@/components/admin/scrapers/test-lab/results-panel';

const mockResults: SkuResult[] = [
  {
    sku: 'TEST-SKU-1',
    sku_type: 'golden',
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
    sku_type: 'edge',
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
    expect(screen.getAllByTestId('sparkline').length).toBeGreaterThan(0);
  });

  it('opens details when a row is clicked', () => {
    render(<ResultsTable results={mockResults} />);
    
    const firstRow = screen.getByText('TEST-SKU-1').closest('tr');
    if (!firstRow) throw new Error('Row not found');
    
    fireEvent.click(firstRow);
    
    expect(screen.getByText('Extraction Results')).toBeInTheDocument();
    expect(screen.getByText('Selector Health')).toBeInTheDocument();
  });

  it('filters results by status', () => {
    render(<ResultsTable results={mockResults} />);
    
    const successFilter = screen.getByTestId('filter-status-success');
    const failedFilter = screen.getByTestId('filter-status-failed');
    
    expect(successFilter).toBeInTheDocument();
    expect(failedFilter).toBeInTheDocument();
    
    fireEvent.click(failedFilter);
    
    expect(screen.queryByText('TEST-SKU-1')).not.toBeInTheDocument();
    expect(screen.getByText('TEST-SKU-2')).toBeInTheDocument();
  });

  it('filters results by sku_type', () => {
    render(<ResultsTable results={mockResults} />);

    const goldenFilter = screen.getByTestId('filter-type-golden');
    const edgeFilter = screen.getByTestId('filter-type-edge');

    expect(goldenFilter).toBeInTheDocument();
    expect(edgeFilter).toBeInTheDocument();

    fireEvent.click(goldenFilter);

    expect(screen.getByText('TEST-SKU-1')).toBeInTheDocument();
    expect(screen.queryByText('TEST-SKU-2')).not.toBeInTheDocument();
  });

  it('maps telemetry selectors to sparkline data', () => {
    const customResults: SkuResult[] = [
      {
        sku: 'SPARK-SKU',
        status: 'success',
        telemetry: {
          selectors: [
            { selector_name: 's1', selector_value: 'v1', status: 'FOUND' },
            { selector_name: 's2', selector_value: 'v2', status: 'ERROR' },
            { selector_name: 's3', selector_value: 'v3', status: 'FOUND' },
          ],
          extractions: []
        }
      }
    ];
    
    render(<ResultsTable results={customResults} />);
    
    const sparkline = screen.getByTestId('sparkline');
    expect(sparkline).toBeInTheDocument();
    
    const polyline = sparkline.querySelector('polyline');
    expect(polyline).toHaveAttribute('points');
    const points = polyline?.getAttribute('points');
    // FOUND -> 1, ERROR -> 0
    expect(points).toBe('0,0 30,20 60,0');
  });
});
