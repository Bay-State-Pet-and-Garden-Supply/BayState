'use client'

import { useState, useRef } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface PickupOnlyToggleProps {
  initialValue: boolean
  productId: string
  action: (formData: FormData) => Promise<void>
}

export function PickupOnlyToggle({ initialValue, productId, action }: PickupOnlyToggleProps) {
  const [isLoading, setIsLoading] = useState(false)
  const checkboxRef = useRef<HTMLButtonElement>(null)

  const handleCheckedChange = async (checked: boolean | 'indeterminate') => {
    setIsLoading(true)
    const formData = new FormData()
    formData.append('product_id', productId)
    formData.append('pickup_only', checked === true ? 'true' : 'false')
    await action(formData)
    setIsLoading(false)
  }

  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        ref={checkboxRef}
        id="pickup_only"
        checked={initialValue}
        disabled={isLoading}
        onCheckedChange={handleCheckedChange}
      />
      <Label htmlFor="pickup_only">Pickup only</Label>
    </div>
  )
}
