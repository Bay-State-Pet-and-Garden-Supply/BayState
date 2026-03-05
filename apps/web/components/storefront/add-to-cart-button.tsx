'use client'

import { useState } from 'react'
import { ShoppingCart, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCartStore } from '@/lib/cart-store'
import { PreorderBatchSelector } from './preorder-batch-selector'
import type { PreorderBatch, PreorderGroup } from '@/lib/types'

interface AddToCartButtonProps {
  product: {
    id: string
    name: string
    slug: string
    price: number
    images?: string[]
    stock_status: 'in_stock' | 'out_of_stock' | 'pre_order'
  }
  preorderGroup?: PreorderGroup | null
  preorderBatches?: PreorderBatch[]
  isPickupOnly?: boolean
}

/**
 * AddToCartButton - Button to add products to cart with feedback.
 * Supports pre-order with batch selection when product is in a preorder group.
 */
export function AddToCartButton({
  product,
  preorderGroup,
  preorderBatches = [],
  isPickupOnly = false,
}: AddToCartButtonProps) {
  const [isAdded, setIsAdded] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const addItem = useCartStore((state) => state.addItem)

  const isPreorderWithBatches = product.stock_status === 'pre_order' && preorderGroup && preorderBatches.length > 0

  const handleAddToCart = () => {
    if (isPreorderWithBatches && !selectedBatchId) {
      return // Don't add if batch not selected
    }

    addItem({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      imageUrl: product.images?.[0] || null,
      preorderBatchId: selectedBatchId,
      pickup_only: isPickupOnly,
    })

    setIsAdded(true)
    setTimeout(() => setIsAdded(false), 2000)
  }

  if (product.stock_status === 'out_of_stock') {
    return (
      <Button size="lg" className="h-14 flex-1 text-lg" disabled>
        Out of Stock
      </Button>
    )
  }

  return (
    <div className="space-y-4">
      {isPreorderWithBatches && (
        <PreorderBatchSelector
          batches={preorderBatches}
          group={preorderGroup!}
          onSelectBatch={setSelectedBatchId}
          selectedBatchId={selectedBatchId}
          isPickupOnly={isPickupOnly || preorderGroup!.pickup_only}
        />
      )}

      <div className="flex items-center gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            type="number"
            min="1"
            max="99"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24"
          />
        </div>

        <Button
          size="lg"
          className="h-14 flex-1 text-lg"
          onClick={handleAddToCart}
          disabled={Boolean(isAdded || (isPreorderWithBatches && !selectedBatchId))}
        >
          {isAdded ? (
            <>
              <Check className="mr-2 h-5 w-5" />
              Added to Cart
            </>
          ) : (
            <>
              <ShoppingCart className="mr-2 h-5 w-5" />
              {product.stock_status === 'pre_order' ? 'Pre-Order Now' : 'Add to Cart'}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
