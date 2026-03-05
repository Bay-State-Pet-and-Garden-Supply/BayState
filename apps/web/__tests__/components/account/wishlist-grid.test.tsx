import { render, screen, fireEvent } from '@testing-library/react'
import { WishlistGrid } from '@/components/account/wishlist-grid'
import { toggleWishlistAction } from '@/lib/account/actions'
import { ProductSummary } from '@/lib/account/types'

jest.mock('@/lib/account/actions', () => ({
    toggleWishlistAction: jest.fn()
}))

beforeAll(() => {
    global.confirm = jest.fn(() => true)
})

const items: ProductSummary[] = [{
    id: 'p1', name: 'Product 1', slug: 'p1', price: 10, images: [], stock_status: 'in_stock'
}]

describe('WishlistGrid', () => {
    it('renders items', () => {
        render(<WishlistGrid items={items} />)
        expect(screen.getByText('Product 1')).toBeInTheDocument()
    })
    it('removes item', async () => {
        render(<WishlistGrid items={items} />)
        fireEvent.click(screen.getByRole('button', { name: /remove/i }))
        expect(toggleWishlistAction).toHaveBeenCalledWith('p1')
    })
    it('shows empty state', () => {
        render(<WishlistGrid items={[]} />)
        expect(screen.getByText(/wishlist is empty/i)).toBeInTheDocument()
    })
})
