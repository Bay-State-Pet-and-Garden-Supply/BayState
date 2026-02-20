import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignupForm } from '@/components/auth/signup-form';
import { signupAction } from '@/lib/auth/actions';

// Mock the server action
jest.mock('@/lib/auth/actions', () => ({
    signupAction: jest.fn(),
}));

describe('SignupForm', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders name, email and password inputs', () => {
        render(<SignupForm />);
        expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it.skip('shows validation error for empty fields', async () => {
        render(<SignupForm />);
        const submitBtn = screen.getByRole('button', { name: /create account/i });

        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(screen.getAllByText(/required/i).length).toBeGreaterThan(0);
        });
    });

    it.skip('shows validation error for short password', async () => {
        render(<SignupForm />);
        const passwordInput = screen.getByLabelText(/password/i);
        const submitBtn = screen.getByRole('button', { name: /create account/i });

        fireEvent.change(passwordInput, { target: { value: '123' } });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(screen.getByText(/characters/i)).toBeInTheDocument();
        });
    });

    it('calls signupAction with valid data', async () => {
        (signupAction as jest.Mock).mockResolvedValue({ success: true });
        render(<SignupForm />);

        fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Test User' } });
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
        fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });

        fireEvent.click(screen.getByRole('button', { name: /create account/i }));

        await waitFor(() => {
            expect(signupAction).toHaveBeenCalledWith({
                fullName: 'Test User',
                email: 'test@example.com',
                password: 'password123'
            });
        });
    });
});
