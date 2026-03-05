import { render, screen } from '@testing-library/react';
import AdminUsersPage from '@/app/admin/users/page';
import { getUsers } from '@/lib/admin/users';

// Mock next/navigation hooks used by AdminUsersClient
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => '/admin/users',
}));

jest.mock('@/lib/admin/users', () => ({
    getUsers: jest.fn(),
}));

jest.mock('@/components/admin/user-role-select', () => ({
    UserRoleSelect: () => <div data-testid="role-select" />
}));

describe('AdminUsersPage', () => {
    it('renders users list', async () => {
        (getUsers as jest.Mock).mockResolvedValue({
            users: [
                { id: '1', full_name: 'User One', email: 'user1@example.com', role: 'customer', created_at: new Date().toISOString() },
                { id: '2', full_name: 'User Two', email: 'user2@example.com', role: 'admin', created_at: new Date().toISOString() }
            ],
            count: 2
        });

        // Async server component test need to await component
        const jsx = await AdminUsersPage({ searchParams: Promise.resolve({}) });
        render(jsx);

        expect(screen.getByText('User One')).toBeInTheDocument();
        expect(screen.getByText('user1@example.com')).toBeInTheDocument();
        expect(screen.getByText('User Two')).toBeInTheDocument();
    });

    it('renders empty state', async () => {
        (getUsers as jest.Mock).mockResolvedValue({ users: [], count: 0 });

        const jsx = await AdminUsersPage({ searchParams: Promise.resolve({}) });
        render(jsx);

        expect(screen.getByText('No users found.')).toBeInTheDocument();
    });
});
