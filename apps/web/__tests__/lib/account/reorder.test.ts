import { getFrequentlyBoughtProducts, getRecentOrders } from '@/lib/account/reorder'

// Create chainable mock
const createMockChain = (finalResult: any) => {
    const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(finalResult),
    }
    // Make select return chainable object with eq
    chain.select.mockReturnValue({ eq: chain.eq })
    chain.eq.mockReturnValue({ order: chain.order, data: finalResult.data, error: finalResult.error })
    chain.order.mockReturnValue({ limit: chain.limit })
    return chain
}

let mockChain: any

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(() => ({
        auth: {
            getUser: jest.fn(() => ({ data: { user: { id: 'test-user' } }, error: null }))
        },
        from: jest.fn(() => mockChain)
    }))
}))

describe('reorder.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('getFrequentlyBoughtProducts', () => {
        it('returns empty array for no order history', async () => {
            mockChain = {
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ data: [], error: null })
                    })
                })
            }

            const result = await getFrequentlyBoughtProducts()
            expect(result).toEqual([])
        })

        it('aggregates and filters products by order count', async () => {
            // The real query returns orders with order_items embedded
            const mockOrdersData = [
                {
                    user_id: 'test-user',
                    order_items: [
                        { item_id: 'p1', item_name: 'Product 1', item_slug: 'p1', unit_price: 10, item_type: 'product' },
                        { item_id: 'p1', item_name: 'Product 1', item_slug: 'p1', unit_price: 10, item_type: 'product' },
                    ]
                },
                {
                    user_id: 'test-user',
                    order_items: [
                        { item_id: 'p2', item_name: 'Product 2', item_slug: 'p2', unit_price: 20, item_type: 'product' },
                    ]
                },
            ]

            // Mock that handles multiple from() calls
            let callCount = 0
            mockChain = {
                select: jest.fn().mockImplementation(() => {
                    callCount++
                    if (callCount === 1) {
                        // First call: orders query
                        return {
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockResolvedValue({ data: mockOrdersData, error: null })
                            })
                        }
                    } else {
                        // Second call: products query
                        return {
                            in: jest.fn().mockResolvedValue({ data: [{ id: 'p1', images: [] }], error: null })
                        }
                    }
                }),
            }

            const result = await getFrequentlyBoughtProducts()
            // Only p1 should be returned (ordered 2 times, p2 only once)
            expect(result.length).toBe(1)
            expect(result[0].id).toBe('p1')
            expect(result[0].order_count).toBe(2)
        })
    })

    describe('getRecentOrders', () => {
        it('returns empty array when no orders', async () => {
            mockChain = {
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockReturnValue({
                            limit: jest.fn().mockResolvedValue({ data: [], error: null })
                        })
                    })
                })
            }

            const result = await getRecentOrders()
            expect(result).toEqual([])
        })

        it('returns orders sorted by date', async () => {
            const mockOrders = [
                { id: 'o1', order_number: '1001', status: 'delivered', total: 50.00, created_at: '2024-01-01' }
            ]

            mockChain = {
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockReturnValue({
                            limit: jest.fn().mockResolvedValue({ data: mockOrders, error: null })
                        })
                    })
                })
            }

            const result = await getRecentOrders()
            expect(result.length).toBe(1)
            expect(result[0].order_number).toBe('1001')
        })
    })
})
