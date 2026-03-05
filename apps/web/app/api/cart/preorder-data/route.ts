import { NextRequest, NextResponse } from 'next/server'
import { fetchPreorderData } from '@/lib/storefront/fulfillment'

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

    // Create validation errors for groups that don't meet minimums
    const errors: string[] = []

    for (const group of groups.values()) {
      // Count products in this group from the request
      // This is a simplification - we'd need actual cart quantities
      // For now, just indicate the group exists
      for (const [productId, groupId] of productGroupMap.entries()) {
        if (groupId === group.id) {
          // Placeholder for quantity counting
          void productId
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
