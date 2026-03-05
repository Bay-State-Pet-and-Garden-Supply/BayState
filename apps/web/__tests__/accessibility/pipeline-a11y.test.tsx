import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { PipelineProductCard } from '../../components/admin/pipeline/PipelineProductCard';
import { PipelineProductDetail } from '../../components/admin/pipeline/PipelineProductDetail';
import { PipelineStatusTabs } from '../../components/admin/pipeline/PipelineStatusTabs';

expect.extend(toHaveNoViolations);

// Mock data
const mockProduct = {
  sku: 'TEST-123',
  input: {
    name: 'Test Product',
    price: 10.99,
  },
  consolidated: {
    name: 'Test Product Consolidated',
    price: 10.99,
    stock_status: 'in_stock',
  },
  pipeline_status: 'staging',
};

const mockCounts = [
  { status: 'staging', count: 10 },
  { status: 'scraped', count: 5 },
  { status: 'consolidated', count: 2 },
  { status: 'approved', count: 1 },
  { status: 'published', count: 0 },
];

describe('Pipeline Accessibility', () => {
  describe('PipelineProductCard', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <PipelineProductCard
          product={mockProduct as any}
          index={0}
          isSelected={false}
          onSelect={() => {}}
          onView={() => {}}
          showBatchSelect={true}
        />
      );
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should be keyboard navigable', () => {
      const onSelect = jest.fn();
      render(
        <PipelineProductCard
          product={mockProduct as any}
          index={0}
          isSelected={false}
          onSelect={onSelect}
          onView={() => {}}
          showBatchSelect={true}
        />
      );

      const card = screen.getByRole('article');
      card.focus();
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledWith('TEST-123', 0, false);
    });
  });

  describe('PipelineStatusTabs', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <>
            <PipelineStatusTabs
            counts={mockCounts as any}
            activeStatus="staging"
            onStatusChange={() => {}}
            />
            <div id="main-content">Content</div>
        </>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should use correct ARIA roles', () => {
      render(
        <PipelineStatusTabs
          counts={mockCounts as any}
          activeStatus="staging"
          onStatusChange={() => {}}
        />
      );

      const tablist = screen.getByRole('tablist');
      expect(tablist).toBeInTheDocument();

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(5);
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    });
  });

  // Note: PipelineProductDetail is harder to test with jest-axe because of the modal portal/fixed positioning
  // and focus trap logic which might require a full DOM environment. 
  // We will test the structure.
  describe('PipelineProductDetail', () => {
    it('should have accessible modal structure', async () => {
        // Mock fetch for the component
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ product: mockProduct, brands: [] }),
            })
        ) as jest.Mock;

        const { container } = render(
            <PipelineProductDetail
                sku="TEST-123"
                onClose={() => {}}
                onSave={() => {}}
            />
        );

        // Wait for loading to finish
        await screen.findByText('Edit Product');

        const results = await axe(container);
        expect(results).toHaveNoViolations();
        
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('aria-labelledby');
    });
  });
});
