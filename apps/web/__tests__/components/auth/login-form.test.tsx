import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from '@/components/auth/login-form';
import { loginAction } from '@/lib/auth/actions';

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
}));

// Mock the server action
jest.mock('@/lib/auth/actions', () => ({
    loginAction: jest.fn(),
}));

describe('LoginForm', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders email and password inputs', () => {
        render(<LoginForm />);
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it.skip('shows validation error for empty fields', async () => {
        render(<LoginForm />);
        const submitBtn = screen.getByRole('button', { name: /sign in/i });

        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(screen.getAllByText(/required/i).length).toBeGreaterThan(0);
        });
    });

    it('calls loginAction with valid data', async () => {
        (loginAction as jest.Mock).mockResolvedValue({ success: true });
        render(<LoginForm />);

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });

        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => {
            expect(loginAction).toHaveBeenCalledWith({
                email: 'test@example.com',
                password: 'password123'
            }, undefined);
        });
    });

    it('displays error message from server', async () => {
        (loginAction as jest.Mock).mockResolvedValue({ error: 'Invalid credentials' });
        render(<LoginForm />);

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });

        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => {
            expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
        });
    });
});
