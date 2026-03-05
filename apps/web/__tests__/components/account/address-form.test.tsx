import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddressForm } from '@/components/account/address-form'
import { addAddressAction } from '@/lib/account/actions'

jest.mock('@/lib/account/actions', () => ({
    addAddressAction: jest.fn()
}))

beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() { }
        unobserve() { }
        disconnect() { }
    };
});

describe('AddressForm', () => {
    const onSuccess = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('validates required fields', async () => {
        render(<AddressForm onSuccess={onSuccess} />)

        fireEvent.click(screen.getByRole('button', { name: /save address/i }))

        await waitFor(() => {
            expect(screen.getByText(/full name is required/i)).toBeInTheDocument()
            expect(screen.getByText(/address line 1 is required/i)).toBeInTheDocument()
        })
        expect(onSuccess).not.toHaveBeenCalled()
    })

    it('submits valid data', async () => {
        (addAddressAction as jest.Mock).mockResolvedValue({ success: true })
        render(<AddressForm onSuccess={onSuccess} />)

        fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'John Doe' } })
        fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '123 Main St' } })
        fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'Boston' } })
        fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'MA' } })
        fireEvent.change(screen.getByLabelText(/zip code/i), { target: { value: '02108' } })

        fireEvent.click(screen.getByRole('button', { name: /save address/i }))

        await waitFor(() => {
            expect(addAddressAction).toHaveBeenCalled()
            expect(onSuccess).toHaveBeenCalled()
        })
    })
})
