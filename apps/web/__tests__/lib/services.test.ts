/**
 * @jest-environment node
 */
import { getServiceBySlug, getAllActiveServices } from '@/lib/services';

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { createClient } from '@/lib/supabase/server';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('Services Data Functions', () => {
  const mockSingle = jest.fn();
  const mockSelect = jest.fn();
  const mockFrom = jest.fn();
  const mockEq = jest.fn();
  const mockOrder = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockSingle.mockResolvedValue({ data: null, error: null });
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });

    mockCreateClient.mockResolvedValue({
      from: mockFrom,
    } as never);
  });

  describe('getServiceBySlug', () => {
    it('queries services table with slug and active filter', async () => {
      await getServiceBySlug('propane-refill');

      expect(mockFrom).toHaveBeenCalledWith('services');
      expect(mockEq).toHaveBeenCalledWith('slug', 'propane-refill');
      expect(mockEq).toHaveBeenCalledWith('is_active', true);
    });

    it('returns null on error', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const result = await getServiceBySlug('nonexistent');

      expect(result).toBeNull();
    });

    it('returns service when found', async () => {
      const mockService = { id: '1', name: 'Propane Refill', slug: 'propane-refill' };
      mockSingle.mockResolvedValue({ data: mockService, error: null });

      const result = await getServiceBySlug('propane-refill');

      expect(result).toEqual(mockService);
    });
  });

  describe('getAllActiveServices', () => {
    it('queries services table with active filter', async () => {
      await getAllActiveServices();

      expect(mockFrom).toHaveBeenCalledWith('services');
      expect(mockEq).toHaveBeenCalledWith('is_active', true);
    });

    it('returns empty array on error', async () => {
      mockOrder.mockResolvedValue({ data: null, error: { message: 'Error' } });

      const result = await getAllActiveServices();

      expect(result).toEqual([]);
    });

    it('returns services when found', async () => {
      const mockServices = [{ id: '1', name: 'Service 1' }];
      mockOrder.mockResolvedValue({ data: mockServices, error: null });

      const result = await getAllActiveServices();

      expect(result).toEqual(mockServices);
    });
  });
});
