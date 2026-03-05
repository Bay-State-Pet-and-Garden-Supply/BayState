'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package } from 'lucide-react';

interface CheckoutFulfillmentProps {
  fulfillmentMethod: 'pickup' | 'delivery';
  onMethodChange: (method: 'pickup' | 'delivery') => void;
  hasPickupOnlyItems: boolean;
}

export function CheckoutFulfillment({
  fulfillmentMethod,
  onMethodChange,
  hasPickupOnlyItems,
}: CheckoutFulfillmentProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          How would you like to receive your order?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={fulfillmentMethod}
          onValueChange={(value: 'pickup' | 'delivery') => onMethodChange(value)}
        >
          <div
            className={`flex items-center space-x-3 rounded-lg border p-4 transition-colors ${
              fulfillmentMethod === 'pickup'
                ? 'border-primary bg-primary/5'
                : 'hover:bg-zinc-50'
            }`}
          >
            <RadioGroupItem value="pickup" id="pickup" />
            <div className="flex-1">
              <Label htmlFor="pickup" className="font-medium cursor-pointer">
                Store Pickup
              </Label>
              <p className="text-sm text-zinc-600">
                Pick up at our store - usually ready same day
              </p>
            </div>
          </div>
          <div
            className={`flex items-center space-x-3 rounded-lg border p-4 transition-colors ${
              fulfillmentMethod === 'delivery'
                ? 'border-primary bg-primary/5'
                : 'hover:bg-zinc-50'
            }`}
          >
            <RadioGroupItem value="delivery" id="delivery" />
            <div className="flex-1">
              <Label htmlFor="delivery" className="font-medium cursor-pointer">
                Local Delivery
              </Label>
              <p className="text-sm text-zinc-600">
                We deliver within 30 miles
              </p>
            </div>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
