import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { loginWithOAuth } from '@/lib/auth/actions';

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
}));

// Mock the server action
jest.mock('@/lib/auth/actions', () => ({
    loginWithOAuth: jest.fn(),
}));

describe('OAuthButtons', () => {
    it('renders only the Google button', () => {
        render(<OAuthButtons />);
        expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /apple/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /facebook/i })).not.toBeInTheDocument();
    });

    it('calls loginWithOAuth with google provider when clicked', async () => {
        render(<OAuthButtons />);

        fireEvent.click(screen.getByRole('button', { name: /google/i }));

        await waitFor(() => {
            expect(loginWithOAuth).toHaveBeenCalledWith('google', undefined);
        });
    });
});
