'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { PromoCodeInput } from '@/components/storefront/promo-code-input';
import { formatCurrency, cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
  pickup_only?: boolean;
}

interface CheckoutSummaryProps {
  items: CartItem[];
  subtotal: number;
  discount: number;
  discountType: 'percentage' | 'fixed_amount' | 'free_shipping' | null;
  promoCode: string | null;
  onApplyPromo: (code: string) => Promise<{ success: boolean; error?: string; discount?: number }>;
  onRemovePromo: () => void;
  fulfillmentMethod: 'pickup' | 'delivery';
  deliveryQuote: {
    fee: number;
    available: boolean;
    distanceMiles: number;
  } | null;
  deliveryAddress: {
    street: string;
    city: string;
  } | null;
  servicesFee: number;
}

export function CheckoutSummary({
  items,
  subtotal,
  discount,
  discountType,
  promoCode,
  onApplyPromo,
  onRemovePromo,
  fulfillmentMethod,
  deliveryQuote,
  servicesFee,
}: CheckoutSummaryProps) {
  const [isItemsExpanded, setIsItemsExpanded] = useState(true);
  const taxRate = 0.0625; // 6.25%
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = discountedSubtotal * taxRate;
  const deliveryFee = deliveryQuote?.fee || 0;
  const totalDeliveryFee = deliveryFee + servicesFee;
  const total = discountedSubtotal + tax + (fulfillmentMethod === 'delivery' ? totalDeliveryFee : 0);

  return (
    <div className="sticky top-24 space-y-6">
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-6">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setIsItemsExpanded(!isItemsExpanded)}
          >
            <h2 className="font-display text-xl">Order Summary</h2>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span>{items.reduce((acc, item) => acc + item.quantity, 0)} items</span>
              {isItemsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>

          <div className={cn(
            "grid transition-all duration-300 ease-in-out",
            isItemsExpanded ? "grid-rows-[1fr] opacity-100 mt-6" : "grid-rows-[0fr] opacity-0"
          )}>
            <div className="overflow-hidden">
              <ul className="space-y-4">
                {items.map((item) => (
                  <li key={item.id} className="flex gap-4">
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400">
                          <span className="text-[10px]">No image</span>
                        </div>
                      )}
                      <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col justify-center min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      {item.pickup_only && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                          Pickup Only
                        </span>
                      )}
                    </div>
                    <div className="flex items-center">
                      <p className="text-sm font-semibold">
                        {formatCurrency(item.price * item.quantity)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              
              <div className="mt-6 flex justify-end">
                <Link href="/cart" className="text-sm font-semibold text-primary hover:underline">
                  Edit Cart
                </Link>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="p-6 bg-muted/30">
          <PromoCodeInput
            subtotal={subtotal}
            appliedCode={promoCode}
            discount={discount}
            discountType={discountType}
            onApply={onApplyPromo}
            onRemove={onRemovePromo}
            className="mb-6"
          />

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Items ({items.length})</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            
            {discount > 0 && (
              <div className="flex justify-between text-sm text-green-600 font-medium">
                <span>Savings ({promoCode})</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fulfillment</span>
              <span className={cn(
                "font-medium",
                fulfillmentMethod === 'pickup' ? "text-green-600" : ""
              )}>
                {fulfillmentMethod === 'pickup' 
                  ? 'Free Pickup' 
                  : deliveryQuote?.available 
                    ? formatCurrency(totalDeliveryFee) 
                    : 'Calculated at checkout'}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated Tax</span>
              <span className="font-medium">{formatCurrency(tax)}</span>
            </div>

            <Separator className="my-2" />

            <div className="flex justify-between items-end">
              <span className="font-display text-lg">Total</span>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Trust Badges */}
      <div className="flex flex-col items-center justify-center gap-4 px-2">
        <div className="flex items-center gap-4 text-muted-foreground opacity-60 grayscale transition-all hover:grayscale-0 hover:opacity-100">
           {/* Placeholder for secure payment icons */}
           <div className="h-6 w-10 bg-zinc-200 rounded animate-pulse" />
           <div className="h-6 w-10 bg-zinc-200 rounded animate-pulse" />
           <div className="h-6 w-10 bg-zinc-200 rounded animate-pulse" />
        </div>
        <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest font-bold">
          Secure encrypted checkout
        </p>
      </div>
    </div>
  );
}
