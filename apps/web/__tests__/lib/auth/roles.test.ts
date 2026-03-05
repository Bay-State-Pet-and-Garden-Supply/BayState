/**
 * @jest-environment node
 */
import { getProfile, getUserRole, hasRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('Roles & Auth Helpers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getProfile', () => {
        it('returns profile when found', async () => {
            const mockProfile = { id: 'user-1', role: 'admin', full_name: 'Admin User' };
            const mockSingle = jest.fn().mockResolvedValue({ data: mockProfile, error: null });
            const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
            const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
            const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

            mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

            const result = await getProfile('user-1');
            expect(result).toEqual(mockProfile);
            expect(mockFrom).toHaveBeenCalledWith('profiles');
            expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
        });

        it('returns null on error', async () => {
            const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });
            const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
            const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
            const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

            mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

            const result = await getProfile('user-1');
            expect(result).toBeNull();
        });
    });

    describe('getUserRole', () => {
        it('returns role string when profile exists', async () => {
            const mockProfile = { id: 'user-1', role: 'staff', full_name: 'Staff User' };
            const mockSingle = jest.fn().mockResolvedValue({ data: mockProfile, error: null });
            const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
            const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
            const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

            mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

            const result = await getUserRole('user-1');
            expect(result).toBe('staff');
        });

        it('returns null if no profile found', async () => {
            const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });
            const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
            const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
            const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

            mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

            const result = await getUserRole('user-1');
            expect(result).toBeNull();
        });
    });

    describe('hasRole', () => {
        it('returns true if user has the role', async () => {
            const mockProfile = { id: 'user-1', role: 'admin' };
            const mockSingle = jest.fn().mockResolvedValue({ data: mockProfile, error: null });
            const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
            const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
            const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

            mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

            const result = await hasRole('user-1', 'admin');
            expect(result).toBe(true);
        });

        it('returns false if user has different role', async () => {
            const mockProfile = { id: 'user-1', role: 'staff' };
            const mockSingle = jest.fn().mockResolvedValue({ data: mockProfile, error: null });
            const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
            const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
            const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

            mockCreateClient.mockResolvedValue({ from: mockFrom } as never);

            const result = await hasRole('user-1', 'admin');
            expect(result).toBe(false);
        });
    });
});
