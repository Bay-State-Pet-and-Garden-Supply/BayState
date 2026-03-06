import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SkuSidebar } from '@/components/admin/scrapers/test-lab/sku-sidebar';
import { bulkRemoveTestSkus, bulkUpdateTestSkuType, addTestSku, removeTestSku } from '@/lib/admin/scraper-configs/actions-normalized';

// Mock the hooks and actions
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock('@/lib/admin/scraper-configs/actions-normalized', () => ({
  addTestSku: jest.fn().mockResolvedValue({ success: true }),
  removeTestSku: jest.fn().mockResolvedValue({ success: true }),
  bulkRemoveTestSkus: jest.fn().mockResolvedValue({ success: true }),
  bulkUpdateTestSkuType: jest.fn().mockResolvedValue({ success: true }),
}));

const mockSkus = [
  { id: '1', sku: 'SKU-1', sku_type: 'test' as const, config_id: 'c1', created_at: '' },
  { id: '2', sku: 'SKU-2', sku_type: 'test' as const, config_id: 'c1', created_at: '' },
];

describe('SkuSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a list of SKUs', () => {
    render(<SkuSidebar configId="c1" testSkus={mockSkus} />);
    expect(screen.getByText('SKU-1')).toBeInTheDocument();
    expect(screen.getByText('SKU-2')).toBeInTheDocument();
  });

  it('adds a new SKU', async () => {
    render(<SkuSidebar configId="c1" testSkus={mockSkus} />);
    
    const input = screen.getByPlaceholderText(/SKU\.\.\./i);
    fireEvent.change(input, { target: { value: 'NEW-SKU' } });
    
    const addBtn = screen.getByTestId('add-sku-btn');
    fireEvent.click(addBtn);
    
    await waitFor(() => {
        expect(addTestSku).toHaveBeenCalledWith('c1', 'NEW-SKU', 'test');
    });
  });

  it('removes a single SKU', async () => {
    render(<SkuSidebar configId="c1" testSkus={mockSkus} />);
    
    // Find all buttons and click the first trash one
    const buttons = screen.getAllByRole('button');
    // Button 0: Add, Button 1: Trash for SKU-1, Button 2: Trash for SKU-2
    // We can also use data-testid if we want more precision
    fireEvent.click(buttons[1]);
    
    await waitFor(() => {
        expect(removeTestSku).toHaveBeenCalledWith('1');
    });
  });

  it('shows bulk actions and calls delete handler on click', async () => {
    render(<SkuSidebar configId="c1" testSkus={mockSkus} />);

    // Select both SKUs
    fireEvent.click(screen.getByTestId('sku-checkbox-1'));
    fireEvent.click(screen.getByTestId('sku-checkbox-2'));
    
    // Check if bulk action footer appears
    expect(screen.getByText(/2 Selected/i)).toBeInTheDocument();
    
    // Click delete
    const deleteBtn = screen.getByRole('button', { name: /bulk delete/i });
    fireEvent.click(deleteBtn);
    
    await waitFor(() => {
        expect(bulkRemoveTestSkus).toHaveBeenCalled();
        const callArgs = (bulkRemoveTestSkus as jest.Mock).mock.calls[0][0];
        expect(callArgs).toContain('1');
        expect(callArgs).toContain('2');
    });
  });

  it('calls type change handler on click', async () => {
    render(<SkuSidebar configId="c1" testSkus={mockSkus} />);

    fireEvent.click(screen.getByTestId('sku-checkbox-1'));
    
    const changeTypeBtn = screen.getByRole('button', { name: /change type/i });
    fireEvent.click(changeTypeBtn);
    
    await waitFor(() => {
        expect(bulkUpdateTestSkuType).toHaveBeenCalledWith(['1'], 'test');
    });
  });
});
