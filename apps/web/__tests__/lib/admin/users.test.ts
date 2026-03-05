import { getUsers, updateUserRole } from '@/lib/admin/users';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

describe('Admin Users Library', () => {
    const mockFrom = jest.fn();
    const mockSelect = jest.fn();
    const mockUpdate = jest.fn();
    const mockEq = jest.fn();
    const mockRange = jest.fn();
    const mockOrder = jest.fn();
    const mockFilter = jest.fn(); // multiple filters

    const mockSupabase = {
        from: mockFrom,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        // Chain setup
        mockFrom.mockReturnValue({ select: mockSelect, update: mockUpdate });
        mockSelect.mockReturnValue({ range: mockRange, eq: mockEq });
        mockRange.mockReturnValue({ order: mockOrder });
        mockOrder.mockResolvedValue({ data: [], error: null, count: 0 });

        // Update chain
        mockUpdate.mockReturnValue({ eq: mockEq });
        mockEq.mockResolvedValue({ data: null, error: null });
    });

    describe('getUsers', () => {
        it('fetches users from profiles table', async () => {
            mockOrder.mockResolvedValue({
                data: [{ id: '1', role: 'customer' }],
                error: null,
                count: 1
            });

            const result = await getUsers();

            expect(mockFrom).toHaveBeenCalledWith('profiles');
            expect(mockSelect).toHaveBeenCalledWith('*', { count: 'exact' });
            expect(result.users).toHaveLength(1);
        });

        it('handles query error', async () => {
            mockOrder.mockResolvedValue({ data: null, error: { message: 'Error' } });
            const result = await getUsers();
            expect(result.users).toEqual([]);
        });

        // Pagination/Search testing would require more complex mock chaining logic
        // skipping for brevity in basic setup
    });

    describe('updateUserRole', () => {
        it('updates user role successfully', async () => {
            mockEq.mockResolvedValue({ error: null });

            const result = await updateUserRole('user-1', 'staff');

            expect(mockFrom).toHaveBeenCalledWith('profiles');
            expect(mockUpdate).toHaveBeenCalledWith({ role: 'staff' });
            expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
            expect(result.success).toBe(true);
        });

        it('handles update error', async () => {
            mockEq.mockResolvedValue({ error: { message: 'Update failed' } });

            const result = await updateUserRole('user-1', 'admin');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Update failed');
        });
    });
});
