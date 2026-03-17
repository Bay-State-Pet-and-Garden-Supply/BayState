'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PromoCodeInput } from '@/components/storefront/promo-code-input';
import { formatCurrency } from '@/lib/utils';
import type { CheckoutUserData } from '@/lib/types';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
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
  deliveryAddress,
  servicesFee,
}: CheckoutSummaryProps) {
  const taxRate = 0.0625; // 6.25%
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = discountedSubtotal * taxRate;
  const deliveryFee = deliveryQuote?.fee || 0;
  const totalDeliveryFee = deliveryFee + servicesFee;

  return (
    <Card className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <CardHeader>
        <h2 className="text-xl font-semibold">Order Summary</h2>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between py-3">
              <div>
                <p className="font-medium text-zinc-900">{item.name}</p>
                <p className="text-sm text-zinc-700">Qty: {item.quantity}</p>
                {item.pickup_only && (
                  <span className="inline-flex items-center text-xs text-amber-600 mt-1">
                    Pickup only
                  </span>
                )}
              </div>
              <p className="font-medium text-zinc-900">
                {formatCurrency(item.price * item.quantity)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t pt-4">
          <PromoCodeInput
            subtotal={subtotal}
            appliedCode={promoCode}
            discount={discount}
            discountType={discountType}
            onApply={onApplyPromo}
            onRemove={onRemovePromo}
            className="mb-4"
          />
        </div>

        <div className="space-y-2 border-t pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-700">Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount ({promoCode})</span>
              <span className="font-medium">-{formatCurrency(discount)}</span>
            </div>
          )}
          {fulfillmentMethod === 'delivery' ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-700">Delivery</span>
                <span className="font-medium">
                  {deliveryQuote?.available ? formatCurrency(totalDeliveryFee) : 'Calculated at checkout'}
                </span>
              </div>
              {servicesFee > 0 && (
                <div className="flex justify-between text-sm text-zinc-600 pl-4">
                  <span>Delivery services</span>
                  <span className="font-medium">{formatCurrency(servicesFee)}</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-700">Shipping</span>
              <span className="font-medium text-green-600">FREE</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-zinc-700">Tax (6.25%)</span>
            <span className="font-medium">{formatCurrency(tax)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-lg font-semibold">
            <span>Total</span>
            <span>{formatCurrency(discountedSubtotal + tax + (fulfillmentMethod === 'delivery' ? totalDeliveryFee : 0))}</span>
          </div>
        </div>

        {fulfillmentMethod === 'pickup' && (
          <div className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-medium">Store Pickup</p>
            <p className="mt-1 text-blue-700">
              Orders are available for pickup at our store. We'll email you when your order is ready.
            </p>
          </div>
        )}

        {fulfillmentMethod === 'delivery' && deliveryQuote?.available && deliveryAddress && (
          <div className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
            <p className="font-medium">Local Delivery</p>
            <p className="mt-1 text-green-700">
              We'll deliver to {deliveryAddress.street}, {deliveryAddress.city}.
              {deliveryQuote.distanceMiles > 0 && ` (${deliveryQuote.distanceMiles.toFixed(1)} miles)`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
