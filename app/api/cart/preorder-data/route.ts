import { NextRequest, NextResponse } from 'next/server'
import { fetchPreorderData, formatValidationErrors } from '@/lib/storefront/fulfillment'
import type { CartItem } from '@/lib/cart-store'

export async function POST(request: NextRequest) {
  try {
    const { productIds } = await request.json()

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({
        groups: {},
        batches: {},
        productGroupMap: {},
        errors: [],
      })
    }

    const { groups, batches, productGroupMap } = await fetchPreorderData(productIds)

    // Format any validation errors
    const groupIds = Array.from(groups.values()).map((g) => g.id)
    const batchData = Array.from(batches.values())

    // Create validation errors for groups that don't meet minimums
    const errors: string[] = []

    for (const group of groups.values()) {
      // Count products in this group from the request
      let totalQuantity = 0
      for (const [productId, groupId] of productGroupMap.entries()) {
        if (groupId === group.id) {
          // This is a simplification - we'd need actual cart quantities
          // For now, just indicate the group exists
        }
      }
    }

    return NextResponse.json({
      groups: Object.fromEntries(groups),
      batches: Object.fromEntries(batches),
      productGroupMap: Object.fromEntries(productGroupMap),
      errors,
    })
  } catch (error) {
    console.error('Error fetching cart preorder data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch preorder data' },
      { status: 500 }
    )
  }
}
