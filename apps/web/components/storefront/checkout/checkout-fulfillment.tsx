'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Truck, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <div className="space-y-4">
      <RadioGroup
        value={fulfillmentMethod}
        onValueChange={(value: 'pickup' | 'delivery') => onMethodChange(value)}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <Label
          htmlFor="pickup"
          className={cn(
            "relative flex cursor-pointer flex-col gap-4 rounded-xl border-2 p-6 transition-all",
            fulfillmentMethod === 'pickup'
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-card hover:border-zinc-300"
          )}
        >
          <div className="flex items-center justify-between">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300",
              fulfillmentMethod === 'pickup' 
                ? "bg-brand-forest-green text-white shadow-md scale-110" 
                : "bg-muted text-muted-foreground"
            )}>
              <Store className="h-6 w-6" />
            </div>
            <RadioGroupItem value="pickup" id="pickup" className="sr-only" />
          </div>
          <div>
            <div className="text-base font-bold">
              Store Pickup
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-normal">
              Pick up at Taunton, MA. Usually ready in 2-4 hours.
            </p>
            <p className="text-xs font-bold text-green-600 mt-2 uppercase tracking-wider">
              Free
            </p>
          </div>
        </Label>

        <Label
          htmlFor="delivery"
          className={cn(
            "relative flex cursor-pointer flex-col gap-4 rounded-xl border-2 p-6 transition-all",
            fulfillmentMethod === 'delivery'
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-card hover:border-zinc-300",
            hasPickupOnlyItems && "opacity-50 cursor-not-allowed grayscale"
          )}
        >
          <div className="flex items-center justify-between">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300",
              fulfillmentMethod === 'delivery' 
                ? "bg-brand-forest-green text-white shadow-md scale-110" 
                : "bg-muted text-muted-foreground"
            )}>
              <Truck className="h-6 w-6" />
            </div>
            <RadioGroupItem value="delivery" id="delivery" className="sr-only" disabled={hasPickupOnlyItems} />
          </div>
          <div>
            <div className="text-base font-bold">
              Local Delivery
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-normal">
              Delivery within 30 miles of our store.
            </p>
            {hasPickupOnlyItems ? (
              <p className="text-xs font-bold text-amber-600 mt-2 uppercase tracking-wider">
                Not available for some items
              </p>
            ) : (
              <p className="text-xs font-bold text-muted-foreground mt-2 uppercase tracking-wider">
                Fee applies
              </p>
            )}
          </div>
        </Label>
      </RadioGroup>
    </div>
  );
}
