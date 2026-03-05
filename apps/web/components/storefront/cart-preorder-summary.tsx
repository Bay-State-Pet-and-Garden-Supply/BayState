'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { AlertCircle, Calendar, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCartStore, type CartItem } from '@/lib/cart-store'
import { formatValidationErrors } from '@/lib/storefront/fulfillment'
import type { PreorderBatch, PreorderGroup } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

interface PreorderData {
  groups: Map<string, PreorderGroup>
  batches: Map<string, PreorderBatch>
  productGroupMap: Map<string, string>
}

interface CartPreorderSummaryProps {
  className?: string
}

export function CartPreorderSummary({ className }: CartPreorderSummaryProps) {
  const items = useCartStore((state) => state.items)
  const [preorderData, setPreorderData] = useState<PreorderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    async function fetchPreorderData() {
      const productIds = items
        .filter((item) => item.preorderBatchId)
        .map((item) => item.id)

      if (productIds.length === 0) {
        setPreorderData(null)
        setLoading(false)
        return
      }

      try {
        const response = await fetch('/api/cart/preorder-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds }),
        })

        if (!response.ok) {
          throw new Error('Failed to fetch preorder data')
        }

        const data = await response.json()
        setPreorderData(data)
        setErrors(data.errors || [])
      } catch {
        console.error('Failed to fetch preorder data')
      } finally {
        setLoading(false)
      }
    }

    fetchPreorderData()
  }, [items])

  // Get items that have preorder batch IDs
  const preorderItems = items.filter((item) => item.preorderBatchId)
  const standardItems = items.filter((item) => !item.preorderBatchId)

  // Group preorder items by batch
  const groupedItems = new Map<string, CartItem[]>()
  for (const item of preorderItems) {
    const batchId = item.preorderBatchId!
    if (!groupedItems.has(batchId)) {
      groupedItems.set(batchId, [])
    }
    groupedItems.get(batchId)!.push(item)
  }

  // Calculate totals per group
  const groupTotals = Array.from(groupedItems.entries()).map(([batchId, batchItems]) => {
    const batch = preorderData?.batches.get(batchId)
    const group = batch ? preorderData?.groups.get(batch.preorder_group_id) : null
    const totalQuantity = batchItems.reduce((sum, item) => sum + item.quantity, 0)

    return {
      batchId,
      batch,
      group,
      items: batchItems,
      totalQuantity,
      minimumQuantity: group?.minimum_quantity || 1,
      isValid: group ? totalQuantity >= group.minimum_quantity : true,
    }
  })

  const hasPickupOnlyItems = items.some((item) => item.pickup_only)

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-20 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="h-5 w-5" />
          Fulfillment Details
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Pickup Only Warning */}
        {hasPickupOnlyItems && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Pickup Required</p>
                <p className="text-sm text-amber-700 mt-1">
                  Some items in your cart are available for pickup only at our store.
                  Delivery is not available for these items.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Preorder Batch Groups */}
        {groupTotals.map(({ batchId, batch, group, items: batchItems, totalQuantity, minimumQuantity, isValid }) => (
          <div
            key={batchId}
            className={`rounded-lg border p-4 ${
              isValid ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Calendar className={`h-5 w-5 mt-0.5 ${isValid ? 'text-green-600' : 'text-amber-600'}`} />
                <div>
                  <p className={`font-medium ${isValid ? 'text-green-800' : 'text-amber-800'}`}>
                    {group?.name || 'Pre-Order'}
                  </p>
                  {batch && (
                    <p className={`text-sm ${isValid ? 'text-green-700' : 'text-amber-700'}`}>
                      Arrival: {format(new Date(batch.arrival_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
              {!isValid && (
                <div className="text-right">
                  <p className="text-sm font-medium text-amber-800">
                    {totalQuantity} / {minimumQuantity} units
                  </p>
                  <p className="text-xs text-amber-700">
                    Add {minimumQuantity - totalQuantity} more
                  </p>
                </div>
              )}
            </div>

            {/* Items in this batch */}
            <ul className="mt-3 flex flex-col gap-3 border-t border-green-200/50 pt-3">
              {batchItems.map((item) => (
                <li key={item.id} className="flex justify-between text-sm py-1">
                  <span className="text-zinc-700">
                    {item.name} × {item.quantity}
                  </span>
                  <span className="text-zinc-900 font-medium">
                    {formatCurrency(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            {!isValid && (
              <p className="mt-3 text-xs text-amber-700 border-t border-amber-200/50 pt-3">
                <strong>Minimum order not met:</strong> This pre-order group requires at least{' '}
                {minimumQuantity} units. Add more items from this group to proceed.
              </p>
            )}
          </div>
        ))}

        {/* Standard Items */}
        {standardItems.length > 0 && (
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="font-medium text-zinc-800">Standard Items</p>
            <p className="text-sm text-zinc-600 mt-1">
              {standardItems.length} {standardItems.length === 1 ? 'item' : 'items'} available for immediate shipping
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
