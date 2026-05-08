import { render, screen, fireEvent } from '@testing-library/react'
import { FavoritesGrid } from '@/components/account/favorites-grid'
import { toggleFavoriteAction } from '@/lib/account/actions'
import { ProductSummary } from '@/lib/account/types'

jest.mock('@/lib/account/actions', () => ({
    toggleFavoriteAction: jest.fn()
}))

beforeAll(() => {
    global.confirm = jest.fn(() => true)
})

const items: ProductSummary[] = [{
    id: 'p1', name: 'Product 1', slug: 'p1', price: 10, images: [], stock_status: 'in_stock'
}]

describe('FavoritesGrid', () => {
    it('renders items', () => {
        render(<FavoritesGrid items={items} />)
        expect(screen.getByText('Product 1')).toBeInTheDocument()
    })
    it('removes item', async () => {
        render(<FavoritesGrid items={items} />)
        fireEvent.click(screen.getByRole('button', { name: /remove/i }))
        expect(toggleFavoriteAction).toHaveBeenCalledWith('p1')
    })
    it('shows empty state', () => {
        render(<FavoritesGrid items={[]} />)
        expect(screen.getByText(/favorites list is empty/i)).toBeInTheDocument()
    })
})
