import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { resetPassword } from '@/lib/auth/actions';

jest.mock('@/lib/auth/actions', () => ({
    resetPassword: jest.fn(),
}));

describe('ForgotPasswordForm', () => {
    it('renders email input', () => {
        render(<ForgotPasswordForm />);
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
    });

    it('validates email', async () => {
        render(<ForgotPasswordForm />);
        fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

        await waitFor(() => {
            expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
        });
    });

    it('calls resetPassword action on valid submit', async () => {
        (resetPassword as jest.Mock).mockResolvedValue({ success: true });

        render(<ForgotPasswordForm />);
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

        await waitFor(() => {
            expect(resetPassword).toHaveBeenCalledWith('test@example.com');
            expect(screen.getByText(/check your email/i)).toBeInTheDocument();
        });
    });

    it('displays error from server', async () => {
        (resetPassword as jest.Mock).mockResolvedValue({ error: 'User not found' });

        render(<ForgotPasswordForm />);
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

        await waitFor(() => {
            expect(screen.getByText('User not found')).toBeInTheDocument();
        });
    });
});
