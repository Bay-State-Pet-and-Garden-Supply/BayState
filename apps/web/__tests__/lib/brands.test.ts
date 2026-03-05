/**
 * @jest-environment node
 */
import {
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
} from '@/lib/brands';

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { createClient } from '@/lib/supabase/server';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('Brands Data Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBrandById', () => {
    it('queries brands table with id filter', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: null });
      const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      await getBrandById('test-uuid');

      expect(mockFrom).toHaveBeenCalledWith('brands');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('id', 'test-uuid');
    });

    it('returns null on error', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });
      const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      const result = await getBrandById('nonexistent');

      expect(result).toBeNull();
    });

    it('returns brand when found', async () => {
      const mockBrand = { id: '1', name: 'Test Brand', slug: 'test-brand' };
      const mockSingle = jest.fn().mockResolvedValue({ data: mockBrand, error: null });
      const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      const result = await getBrandById('1');

      expect(result).toEqual(mockBrand);
    });
  });

  describe('createBrand', () => {
    it('inserts a new brand into brands table', async () => {
      const newBrand = { name: 'New Brand', slug: 'new-brand' };
      const mockSingle = jest.fn().mockResolvedValue({ data: { id: '1', ...newBrand }, error: null });
      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      await createBrand(newBrand);

      expect(mockFrom).toHaveBeenCalledWith('brands');
      expect(mockInsert).toHaveBeenCalledWith(newBrand);
    });

    it('returns the created brand on success', async () => {
      const mockBrand = { id: '1', name: 'New Brand', slug: 'new-brand', logo_url: null, created_at: '2024-01-01' };
      const mockSingle = jest.fn().mockResolvedValue({ data: mockBrand, error: null });
      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      const result = await createBrand({ name: 'New Brand', slug: 'new-brand' });

      expect(result).toEqual(mockBrand);
    });

    it('returns null on insert error', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } });
      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      const result = await createBrand({ name: 'Test', slug: 'test' });

      expect(result).toBeNull();
    });
  });

  describe('updateBrand', () => {
    it('updates brand in brands table by id', async () => {
      const updateData = { name: 'Updated Brand' };
      const mockEq = jest.fn().mockResolvedValue({ data: { id: '1', ...updateData }, error: null });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      await updateBrand('1', updateData);

      expect(mockFrom).toHaveBeenCalledWith('brands');
      expect(mockUpdate).toHaveBeenCalledWith(updateData);
      expect(mockEq).toHaveBeenCalledWith('id', '1');
    });

    it('returns updated brand on success', async () => {
      const mockBrand = { id: '1', name: 'Updated Brand', slug: 'updated-brand' };
      const mockEq = jest.fn().mockResolvedValue({ data: mockBrand, error: null });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      const result = await updateBrand('1', { name: 'Updated Brand' });

      expect(result).toEqual(mockBrand);
    });

    it('returns null on update error', async () => {
      const mockEq = jest.fn().mockResolvedValue({ data: null, error: { message: 'Update failed' } });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      const result = await updateBrand('1', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('deleteBrand', () => {
    it('deletes brand from brands table by id', async () => {
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      const mockDelete = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      await deleteBrand('1');

      expect(mockFrom).toHaveBeenCalledWith('brands');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('id', '1');
    });

    it('returns true on successful delete', async () => {
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      const mockDelete = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      const result = await deleteBrand('1');

      expect(result).toBe(true);
    });

    it('returns false on delete error', async () => {
      const mockEq = jest.fn().mockResolvedValue({ error: { message: 'Delete failed' } });
      const mockDelete = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete });

      mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

      const result = await deleteBrand('1');

      expect(result).toBe(false);
    });
  });
});
