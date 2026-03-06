import { render, screen } from '@testing-library/react';
import { TestLabClient } from '@/components/admin/scrapers/test-lab/test-lab-client';

// Mock the hooks and actions
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock('@/lib/realtime/useJobBroadcasts', () => ({
  useJobBroadcasts: jest.fn(),
}));

jest.mock('@/lib/realtime/useJobSubscription', () => ({
  useJobSubscription: jest.fn(),
}));

// Mock the sub-components to verify their presence
jest.mock('@/components/admin/scrapers/test-lab/sku-sidebar', () => ({
  SkuSidebar: () => <div data-testid="sku-sidebar">SKU Sidebar</div>,
}));

jest.mock('@/components/admin/scrapers/test-lab/results-table', () => ({
  ResultsTable: () => <div data-testid="results-table">Results Table</div>,
}));

jest.mock('@/components/admin/scrapers/test-lab/log-terminal', () => ({
  LogTerminal: () => <div data-testid="log-terminal">Log Terminal</div>,
}));

jest.mock('@/components/admin/scrapers/test-lab/results-panel', () => ({
  ResultsPanel: () => <div data-testid="results-panel">Results Panel</div>,
}));

const mockProps = {
  configId: 'config-123',
  versionId: 'version-456',
  testRuns: [],
  testSkus: [
    { id: '1', sku: 'SKU-1', sku_type: 'test' as const, config_id: 'config-123', created_at: '' }
  ],
  scraperName: 'Test Scraper',
};

describe('TestLabClient', () => {
  it('renders the new high-density layout with sidebar', () => {
    render(<TestLabClient {...mockProps} />);
    
    // Check for the sidebar
    expect(screen.getByTestId('sku-sidebar')).toBeInTheDocument();
    
    // Check for the results table (newly integrated)
    expect(screen.getByTestId('results-table')).toBeInTheDocument();
    
    // Check for the terminal
    expect(screen.getByTestId('log-terminal')).toBeInTheDocument();
  });
});
