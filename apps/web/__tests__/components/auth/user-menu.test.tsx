import { render, screen } from '@testing-library/react';
import { UserMenu } from '@/components/auth/user-menu';
import { User } from '@supabase/supabase-js';

// Mock signOutAction? It's used in form action.
// React Test Library doesn't execute form actions.
// Just check rendering.

jest.mock('@/lib/auth/actions', () => ({
    signOutAction: jest.fn(),
}));

describe('UserMenu', () => {
    it('renders Sign In link when user is null', () => {
        render(<UserMenu user={null} />);
        expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    });

    it('renders Account link and Sign Out button when user exists', () => {
        const mockUser = { email: 'test@example.com' } as User;
        render(<UserMenu user={mockUser} />);

        const links = screen.getAllByRole('link', { name: /account/i });
        expect(links.length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    });
});
