import { render, screen, fireEvent } from '@testing-library/react';
import { SkuSidebar } from '@/components/admin/scrapers/test-lab/sku-sidebar';
import { ScraperTestSku } from '@/lib/admin/scrapers/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}));

const mockSkus: ScraperTestSku[] = [
  { id: '1', config_id: 'c1', sku: 'SKU-1', sku_type: 'test', created_at: '' },
  { id: '2', config_id: 'c1', sku: 'SKU-2', sku_type: 'fake', created_at: '' },
];

describe('SkuSidebar', () => {
  it('renders a list of SKUs', () => {
    render(<SkuSidebar configId="c1" testSkus={mockSkus} />);
    
    expect(screen.getByText('SKU-1')).toBeInTheDocument();
  });

  it('shows tabs for different SKU types', () => {
    render(<SkuSidebar configId="c1" testSkus={mockSkus} />);
    
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Fake')).toBeInTheDocument();
  });
});
