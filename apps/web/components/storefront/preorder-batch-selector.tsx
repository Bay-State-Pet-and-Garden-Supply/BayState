'use client'

import { useState } from 'react'
import { format, isPast } from 'date-fns'
import { AlertCircle, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import type { PreorderBatch, PreorderGroup } from '@/lib/types'

interface PreorderBatchSelectorProps {
  batches: PreorderBatch[]
  group: PreorderGroup
  onSelectBatch: (batchId: string | null) => void
  selectedBatchId: string | null
  isPickupOnly: boolean
}

export function PreorderBatchSelector({
  batches,
  group,
  onSelectBatch,
  selectedBatchId,
  isPickupOnly,
}: PreorderBatchSelectorProps) {
  const minimumQuantity = group.minimum_quantity

  const selectedBatch = batches.find((b) => b.id === selectedBatchId)

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy')
    } catch {
      return dateStr
    }
  }

  if (batches.length === 0) {
    return (
      <Card className="mb-4 border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">No Arrival Dates Available</p>
              <p className="text-sm text-amber-700 mt-1">
                This pre-order product currently has no scheduled arrival dates. Please check back later.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {isPickupOnly && (
        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-800">Pickup Only</p>
                <p className="text-sm text-blue-700 mt-1">
                  This product is available for pickup only at our store.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Label htmlFor="batch-select" className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Select Arrival Date
        </Label>
        <Select
          value={selectedBatchId || ''}
          onValueChange={(value) => onSelectBatch(value || null)}
        >
          <SelectTrigger id="batch-select" className="w-full">
            <SelectValue placeholder="Choose an arrival date" />
          </SelectTrigger>
          <SelectContent>
            {batches.map((batch) => {
              const deadline = batch.ordering_deadline
              const deadlinePassed = deadline && isPast(new Date(deadline))
              const isFull = batch.capacity !== null

              return (
                <SelectItem
                  key={batch.id}
                  value={batch.id}
                  disabled={deadlinePassed || isFull}
                >
                  <div className="flex items-center justify-between w-full gap-4">
                    <span>{formatDate(batch.arrival_date)}</span>
                    <span className="text-xs text-muted-foreground">
                      {deadlinePassed
                        ? '(Order deadline passed)'
                        : isFull
                        ? '(Full)'
                        : deadline
                        ? `Order by ${formatDate(deadline)}`
                        : ''}
                    </span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {selectedBatch && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="font-medium">Arrival: {formatDate(selectedBatch.arrival_date)}</p>
              {selectedBatch.ordering_deadline && (
                <p className="text-sm text-muted-foreground">
                  Order by: {formatDate(selectedBatch.ordering_deadline)}
                </p>
              )}
              {selectedBatch.capacity !== null && (
                <p className="text-sm text-muted-foreground">
                  Capacity: {selectedBatch.capacity} units
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {group.minimum_quantity > 1 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Minimum Order: {minimumQuantity} units</p>
                <p className="text-sm text-amber-700 mt-1">
                  This pre-order group requires at least {minimumQuantity} units. Your total
                  order quantity across all items in this group will be combined to meet the minimum.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {group.display_copy && (
        <p className="text-sm text-muted-foreground italic">{group.display_copy}</p>
      )}
    </div>
  )
}
