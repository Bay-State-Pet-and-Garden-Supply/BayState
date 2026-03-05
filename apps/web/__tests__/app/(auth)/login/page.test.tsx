import { render, screen } from '@testing-library/react';
import LoginPage from '@/app/(auth)/login/page';

// Mock child component to focus on page render
jest.mock('@/components/auth/login-form', () => ({
    LoginForm: () => <div data-testid="login-form">Login Form Mock</div>
}));
jest.mock('@/components/auth/oauth-buttons', () => ({
    OAuthButtons: () => <div data-testid="oauth-buttons">OAuth Buttons Mock</div>
}));

describe('LoginPage', () => {
    it('renders sign in heading and link to signup', () => {
        render(<LoginPage />);
        expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/signup');
        expect(screen.getByTestId('login-form')).toBeInTheDocument();
        expect(screen.getByTestId('oauth-buttons')).toBeInTheDocument();
    });
});
