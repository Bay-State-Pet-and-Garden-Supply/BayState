import { render, screen } from '@testing-library/react';
import AdminLoginPage from '@/app/admin/(auth)/login/page';

jest.mock('@/app/admin/(auth)/login/actions', () => ({
  login: jest.fn(),
}));

describe('Admin Login Page', () => {
  it('renders login form', () => {
    render(<AdminLoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
