import { render, screen, waitFor } from '@testing-library/react';
import EditProductPage from '@/app/admin/products/[id]/edit/page';

// Polyfill fetch for JSDOM
if (typeof fetch === 'undefined') {
  global.fetch = jest.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })
  ) as jest.Mock;
}

const params = { id: '123' };

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: '123', name: 'Existing Product', slug: 'existing', price: 10 },
      error: null
    }),
  }),
}));

jest.mock('@/app/admin/products/[id]/edit/actions', () => ({
  updateProduct: jest.fn(),
}));

jest.mock('@/lib/admin/preorder-actions', () => ({
  getPreorderGroups: jest.fn().mockResolvedValue([]),
  getProductPreorderAssignment: jest.fn().mockResolvedValue(null),
  assignProductToPreorderGroup: jest.fn(),
  updateProductPickupOnly: jest.fn(),
}));

describe('Edit Product Page', () => {
  it('pre-fills form with product data', async () => {
    const Page = await EditProductPage({ params: Promise.resolve(params) });
    render(Page);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Existing Product')).toBeInTheDocument();
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });
  });
});
