import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UpdatePasswordForm } from '@/components/auth/update-password-form';
import { updatePassword } from '@/lib/auth/actions';

jest.mock('@/lib/auth/actions', () => ({
    updatePassword: jest.fn(),
}));

describe('UpdatePasswordForm', () => {
    it('renders password inputs', () => {
        render(<UpdatePasswordForm />);
        expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });

    it('validates password length and match', async () => {
        render(<UpdatePasswordForm />);

        // Short password
        fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: '123' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));

        await waitFor(() => {
            expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
        });

        // Mismatch
        fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'password123' } });
        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));

        await waitFor(() => {
            expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
        });
    });

    it('calls updatePassword on valid submit', async () => {
        (updatePassword as jest.Mock).mockResolvedValue(undefined); // void or redirect

        render(<UpdatePasswordForm />);
        fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpassword123' } });
        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newpassword123' } });

        fireEvent.click(screen.getByRole('button', { name: /update password/i }));

        await waitFor(() => {
            expect(updatePassword).toHaveBeenCalledWith('newpassword123');
        });
    });
});
