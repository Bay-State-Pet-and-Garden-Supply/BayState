import { render, screen } from '@testing-library/react';
import SignupPage from '@/app/(auth)/signup/page';

// Mock child component to focus on page render
jest.mock('@/components/auth/signup-form', () => ({
    SignupForm: () => <div data-testid="signup-form">Signup Form Mock</div>
}));
jest.mock('@/components/auth/oauth-buttons', () => ({
    OAuthButtons: () => <div data-testid="oauth-buttons">OAuth Buttons Mock</div>
}));

describe('SignupPage', () => {
    it('renders sign up heading and link to login', () => {
        render(<SignupPage />);
        expect(screen.getByRole('heading', { name: /create an account/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
        expect(screen.getByTestId('signup-form')).toBeInTheDocument();
        expect(screen.getByTestId('oauth-buttons')).toBeInTheDocument();
    });
});
