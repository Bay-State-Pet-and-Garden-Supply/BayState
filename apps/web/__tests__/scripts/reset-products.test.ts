/**
 * @jest-environment node
 */
import { resetProducts } from '../../scripts/reset-products-logic';

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));

import { createAdminClient } from '@/lib/supabase/server';

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;

describe('Product Reset Script Logic', () => {
  const mockUpdate = jest.fn();
  const mockDelete = jest.fn();
  const mockFrom = jest.fn();
  const mockEq = jest.fn();
  const mockOr = jest.fn();
  const mockNeq = jest.fn();
  const mockIn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup the mock chain for update
    mockNeq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ neq: mockNeq });
    
    // Setup the mock chain for delete
    mockOr.mockResolvedValue({ error: null });
    mockIn.mockResolvedValue({ error: null, data: [] });
    mockDelete.mockReturnValue({ or: mockOr, in: mockIn });

    mockFrom.mockReturnValue({
      update: mockUpdate,
      delete: mockDelete,
    });

    mockCreateAdminClient.mockResolvedValue({
      from: mockFrom,
    } as any);
  });

  it('resets published_at and is_featured for all products', async () => {
    await resetProducts();

    expect(mockFrom).toHaveBeenCalledWith('products');
    expect(mockUpdate).toHaveBeenCalledWith({
      published_at: null,
      is_featured: false,
    });
    // It should target all products (using a broad filter like neq('id', '000...'))
    expect(mockNeq).toHaveBeenCalledWith('id', '00000000-0000-0000-0000-000000000000');
  });

  it('deletes placeholder products identified by name, slug or images', async () => {
    await resetProducts();

    expect(mockFrom).toHaveBeenCalledWith('products');
    expect(mockDelete).toHaveBeenCalled();
    // Verify it uses the 'or' filter for placeholders
    expect(mockOr).toHaveBeenCalledWith(
      expect.stringContaining('slug.eq.test-product')
    );
    expect(mockOr).toHaveBeenCalledWith(
      expect.stringContaining('name.ilike.Test %')
    );
  });

  it('handles Supabase errors gracefully', async () => {
    mockNeq.mockResolvedValue({ error: { message: 'Database Error' } });
    
    await expect(resetProducts()).rejects.toThrow('Database Error');
  });
});
