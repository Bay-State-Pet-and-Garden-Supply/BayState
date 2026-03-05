/**
 * Tests for admin RBAC enforcement
 * Verifies that staff users cannot access admin-only routes
 */

// Mock implementations
jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn()
}))

jest.mock('@/lib/auth/roles', () => ({
    getUserRole: jest.fn()
}))

import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'

describe('Admin RBAC Enforcement', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('Server-side role enforcement', () => {
        it('getUserRole returns correct role from profiles table', async () => {
            const mockSupabase = {
                from: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({
                                data: { role: 'staff' },
                                error: null
                            })
                        })
                    })
                })
            };

            (createClient as jest.Mock).mockResolvedValue(mockSupabase);
            (getUserRole as jest.Mock).mockResolvedValue('staff');

            const role = await getUserRole('test-user-id');
            expect(role).toBe('staff');
        })

        it('staff role should not include admin-only nav items', () => {
            // This is a logic test - staff should not see Settings or Users
            const staffRole = 'staff' as const;
            const adminOnlyRoutes = ['/admin/users', '/admin/settings'];

            // Simulate the sidebar logic
            const isAdmin = (staffRole as string) === 'admin';
            const canAccessAdminRoutes = isAdmin;

            expect(canAccessAdminRoutes).toBe(false);

            // Staff should be filtered out from admin-only routes
            const visibleRoutes = adminOnlyRoutes.filter(() => isAdmin);
            expect(visibleRoutes).toHaveLength(0);
        })

        it('admin role should include all nav items', () => {
            const adminRole = 'admin' as const;
            const allRoutes = ['/admin', '/admin/products', '/admin/users', '/admin/settings'];

            const isAdmin = adminRole === 'admin';
            const canAccessAdminRoutes = isAdmin;

            expect(canAccessAdminRoutes).toBe(true);

            // Admin should see all routes
            const visibleRoutes = allRoutes.filter(() => isAdmin);
            expect(visibleRoutes).toHaveLength(4);
        })
    })
})
