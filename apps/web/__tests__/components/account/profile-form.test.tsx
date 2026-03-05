import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProfileForm } from '@/components/account/profile-form'
import { updateProfileAction } from '@/lib/account/actions'
import { UserRole } from '@/lib/auth/roles'

jest.mock('@/lib/account/actions', () => ({
    updateProfileAction: jest.fn()
}))

const mockProfile = {
    id: '123',
    full_name: 'John Doe',
    email: 'john@example.com',
    phone: '555-0199',
    role: 'customer' as UserRole,
    created_at: '',
    updated_at: ''
}

describe('ProfileForm', () => {
    it('renders with initial values', () => {
        render(<ProfileForm profile={mockProfile} />)
        expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument()
        expect(screen.getByDisplayValue('555-0199')).toBeInTheDocument()
    })

    it('submits updated values', async () => {
        (updateProfileAction as jest.Mock).mockResolvedValue({ success: true })
        render(<ProfileForm profile={mockProfile} />)

        fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Jane Doe' } })
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => {
            expect(updateProfileAction).toHaveBeenCalledWith(expect.objectContaining({
                fullName: 'Jane Doe'
            }))
            expect(screen.getByText(/profile updated successfully/i)).toBeInTheDocument()
        })
    })

    it('displays error info', async () => {
        (updateProfileAction as jest.Mock).mockResolvedValue({ error: 'Update failed' })
        render(<ProfileForm profile={mockProfile} />)

        fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => {
            expect(screen.getByText('Update failed')).toBeInTheDocument()
        })
    })
})
