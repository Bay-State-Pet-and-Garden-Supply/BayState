import { render, screen, fireEvent } from '@testing-library/react';
import { UserMenu } from '@/components/auth/user-menu';
import { User } from '@supabase/supabase-js';

// Mock signOutAction? It's used in form action.
// React Test Library doesn't execute form actions.
// Just check rendering.

jest.mock('@/lib/auth/actions', () => ({
    signOutAction: jest.fn(),
}));

jest.mock('@radix-ui/react-dropdown-menu', () => ({
    Root: ({ children }: any) => <div>{children}</div>,
    Trigger: ({ children }: any) => <button>{children}</button>,
    Portal: ({ children }: any) => <>{children}</>,
    Content: ({ children }: any) => <div data-testid="dropdown-content">{children}</div>,
    Item: ({ children, onClick }: any) => <div role="menuitem" onClick={onClick}>{children}</div>,
    Separator: () => <hr />,
    Label: ({ children }: any) => <div>{children}</div>,
    Group: ({ children }: any) => <div>{children}</div>,
}));

describe('UserMenu', () => {
    it('renders Sign In link when user is null', () => {
        render(<UserMenu user={null} userRole={null} />);
        expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    });

    it('renders Account link and Sign Out button when user exists', () => {
        const mockUser = { email: 'test@example.com', user_metadata: { full_name: 'Test User' } } as unknown as User;
        render(<UserMenu user={mockUser} userRole="user" />);

        // Check for menu items (they should be present because of our mock)
        expect(screen.getByRole('menuitem', { name: /my profile/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
    });
});
