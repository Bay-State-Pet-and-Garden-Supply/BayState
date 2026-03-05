import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddressList } from '@/components/account/address-list'
import { Address } from '@/lib/account/types'
import { deleteAddressAction, setDefaultAddressAction } from '@/lib/account/actions'

jest.mock('@/lib/account/actions', () => ({
    deleteAddressAction: jest.fn(),
    setDefaultAddressAction: jest.fn(),
    addAddressAction: jest.fn(),
}))

beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() { }
        unobserve() { }
        disconnect() { }
    };
});

const mockAddresses: Address[] = [
    {
        id: '1',
        user_id: 'u1',
        full_name: 'John Doe',
        address_line1: '123 Main St',
        address_line2: null,
        city: 'Boston',
        state: 'MA',
        zip_code: '02108',
        phone: null,
        is_default: true,
        created_at: '2023-01-01'
    },
    {
        id: '2',
        user_id: 'u1',
        full_name: 'Jane Doe',
        address_line1: '456 Oak St',
        address_line2: null,
        city: 'Cambridge',
        state: 'MA',
        zip_code: '02139',
        phone: null,
        is_default: false,
        created_at: '2023-01-02'
    }
]

describe('AddressList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Mock confirm
        global.confirm = jest.fn(() => true)
    })

    it('renders addresses', () => {
        render(<AddressList initialAddresses={mockAddresses} />)
        expect(screen.getByText('123 Main St')).toBeInTheDocument()
        expect(screen.getByText('456 Oak St')).toBeInTheDocument()
    })

    it('shows default badge', () => {
        render(<AddressList initialAddresses={mockAddresses} />)
        // Find "Default" badge inside first card
        expect(screen.getByText('Default')).toBeInTheDocument()
    })

    it('calls delete action', async () => {
        (deleteAddressAction as jest.Mock).mockResolvedValue({ success: true })
        render(<AddressList initialAddresses={mockAddresses} />)

        // Find delete button for second address (non-default)
        // Since first is default, it might have delete button? logic says yes.
        const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
        fireEvent.click(deleteButtons[1])

        await waitFor(() => {
            expect(deleteAddressAction).toHaveBeenCalledWith('2')
        })
    })

    it('calls set default action', async () => {
        (setDefaultAddressAction as jest.Mock).mockResolvedValue({ success: true })
        render(<AddressList initialAddresses={mockAddresses} />)

        fireEvent.click(screen.getByRole('button', { name: /set default/i }))

        await waitFor(() => {
            expect(setDefaultAddressAction).toHaveBeenCalledWith('2')
        })
    })

    it('shows add form on click', () => {
        render(<AddressList initialAddresses={[]} />)
        fireEvent.click(screen.getByText(/add new address/i))
        expect(screen.getByText(/save address/i)).toBeInTheDocument() // Button in form
    })
})
