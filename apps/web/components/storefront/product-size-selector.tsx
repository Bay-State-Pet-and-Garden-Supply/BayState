'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import type { ProductGroup, ProductGroupMember, Product } from '@/lib/types'

interface ProductSizeSelectorProps {
  group: ProductGroup
  members: Array<{ member: ProductGroupMember; product: Product }>
  selectedProductId: string
  basePath: string
}

export function ProductSizeSelector({
  group,
  members,
  selectedProductId,
  basePath,
}: ProductSizeSelectorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSelectProduct = useCallback(
    (productId: string) => {
      // Navigate to the same page with the new sku parameter
      const newUrl = `${basePath}?sku=${productId}`
      router.push(newUrl, { scroll: false })
    },
    [router, basePath]
  )

  // Sort members by sort_order
  const sortedMembers = [...members].sort((a, b) => a.member.sort_order - b.member.sort_order)

  return (
    <Card className="mb-4">
      <CardContent className="pt-6">
        <div className="space-y-3">
          <Label className="text-sm font-medium">Select Size</Label>

          <div className="flex flex-wrap gap-2">
            {sortedMembers.map(({ member, product }) => {
              const isSelected = product.id === selectedProductId
              const isOutOfStock = product.stock_status === 'out_of_stock'

              return (
                <Button
                  key={product.id}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'min-w-[80px] justify-between gap-2',
                    isSelected && 'ring-2 ring-offset-2 ring-primary',
                    isOutOfStock && 'opacity-50 cursor-not-allowed'
                  )}
                  disabled={isOutOfStock}
                  onClick={() => handleSelectProduct(product.id)}
                >
                  <span>{member.display_label || extractSizeLabel(product.name)}</span>
                  <span className="text-muted-foreground text-xs ml-1">
                    {formatPrice(product.price)}
                  </span>
                </Button>
              )
            })}
          </div>

          {/* Selected product info */}
          {(() => {
            const selectedMember = members.find((m) => m.product.id === selectedProductId)
            if (!selectedMember) return null

            const { product } = selectedMember

            return (
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Selected:</span>
                  <span className="font-medium">
                    {selectedMember.member.display_label || extractSizeLabel(product.name)}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Price:</span>
                  <span className="font-medium">{formatPrice(product.price)}</span>
                </div>
                {product.stock_status === 'out_of_stock' && (
                  <p className="text-red-600 text-sm mt-2">Out of Stock</p>
                )}
              </div>
            )
          })()}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Extract size/weight label from product name.
 * Looks for patterns like "5 lb", "30 lb", "10 oz", etc.
 */
function extractSizeLabel(productName: string): string {
  // Common size/weight patterns
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(lb|pound|pounds)/i,
    /(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)/i,
    /(\d+(?:\.\d+)?)\s*(kg|kilogram|kilograms)/i,
    /(\d+(?:\.\d+)?)\s*(g|gram|grams)/i,
    /(\d+)\s*(ct|count)/i,
    /(\d+)\s*(pack|packs)/i,
  ]

  for (const pattern of patterns) {
    const match = productName.match(pattern)
    if (match) {
      // Normalize the unit
      let unit = match[2].toLowerCase()
      if (unit.startsWith('pound')) unit = 'lb'
      else if (unit.startsWith('ounce')) unit = 'oz'
      else if (unit.startsWith('kilogram')) unit = 'kg'
      else if (unit.startsWith('gram')) unit = 'g'
      else if (unit.startsWith('count')) unit = 'ct'

      return `${match[1]} ${unit}`
    }
  }

  // Fallback: return the product name if no size pattern found
  return productName
}

/**
 * Format price for display.
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)
}
