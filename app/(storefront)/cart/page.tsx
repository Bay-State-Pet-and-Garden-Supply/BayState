'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FreeShippingBar } from '@/components/storefront/free-shipping-bar';
import { PromoCodeInput } from '@/components/storefront/promo-code-input';
import { CartPreorderSummary } from '@/components/storefront/cart-preorder-summary';
import { formatCurrency } from '@/lib/utils';

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clearCart);
  const subtotal = useCartStore((state) => state.getSubtotal());
  const itemCount = useCartStore((state) => state.getItemCount());
  const promo = useCartStore((state) => state.promo);
  const applyPromoCode = useCartStore((state) => state.applyPromoCode);
  const clearPromoCode = useCartStore((state) => state.clearPromoCode);
  const discount = useCartStore((state) => state.getDiscount());
  const total = useCartStore((state) => state.getTotal());
  const hasFreeShipping = useCartStore((state) => state.hasFreeShipping());

  const handleApplyPromo = async (code: string) => {
    try {
      const response = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal }),
      });

      const data = await response.json();

      if (!data.valid) {
        return { success: false, error: data.error };
      }

      applyPromoCode(data.code, data.discount, data.discountType, data.promoCodeId || '');
      return { success: true, discount: data.discount };
    } catch {
      return { success: false, error: 'Failed to validate promo code' };
    }
  };

  return (
    <div className="w-full px-4 py-8">
      <div className="mb-8">
        <Link
          href="/products"
          className="mb-4 inline-flex items-center text-sm text-zinc-700 hover:text-zinc-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Continue Shopping
        </Link>
        <h1 className="text-3xl font-bold text-zinc-900">Shopping Cart</h1>
        <p className="mt-2 text-zinc-700">
          {itemCount} {itemCount === 1 ? 'item' : 'items'} in your cart
        </p>
      </div>

      {items.length > 0 ? (
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <FreeShippingBar subtotal={subtotal} className="mb-4" />

            <div className="rounded-lg border bg-white">
              <ul className="divide-y">
                {items.map((item) => {
                  const formattedPrice = formatCurrency(item.price);
                  const formattedTotal = formatCurrency(item.price * item.quantity);

                  return (
                    <li key={item.id} className="flex gap-4 p-4">
                      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100 relative">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.name}
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-zinc-700">
                            <ShoppingBag className="h-8 w-8" />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col">
                        <div className="flex justify-between">
                          <div>
                            <Link
                              href={`/products/${item.slug}`}
                              className="font-medium text-zinc-900 hover:text-zinc-700"
                            >
                              {item.name}
                            </Link>
                            <p className="mt-1 text-sm text-zinc-700">
                              {formattedPrice} each
                            </p>
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="text-zinc-700 hover:text-red-600"
                            aria-label="Remove item"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>

                        <div className="mt-auto flex items-center justify-between pt-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-zinc-50"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-10 text-center font-medium">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-zinc-50"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>

                          <span className="text-lg font-semibold text-zinc-900">
                            {formattedTotal}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="border-t p-4">
                <Button
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={clearCart}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Cart
                </Button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              <CartPreorderSummary />

              <div className="rounded-lg border bg-white p-6">
                <h2 className="mb-4 text-lg font-semibold text-zinc-900">
                  Order Summary
                </h2>

                <PromoCodeInput
                  subtotal={subtotal}
                  appliedCode={promo.code}
                  discount={discount}
                  discountType={promo.discountType}
                  onApply={handleApplyPromo}
                  onRemove={clearPromoCode}
                  className="mb-4"
                />

                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-zinc-700">Subtotal</dt>
                    <dd className="font-medium text-zinc-900">{formatCurrency(subtotal)}</dd>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <dt>Discount</dt>
                      <dd className="font-medium">-{formatCurrency(discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-zinc-700">Shipping</dt>
                    <dd className="font-medium text-zinc-900">
                      {hasFreeShipping ? (
                        <span className="text-green-600">FREE</span>
                      ) : (
                        'Calculated at checkout'
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-700">Tax</dt>
                    <dd className="font-medium text-zinc-900">Calculated at checkout</dd>
                  </div>
                </dl>

                <div className="mt-4 border-t pt-4">
                  <div className="flex justify-between">
                    <span className="text-lg font-semibold text-zinc-900">Estimated Total</span>
                    <span className="text-lg font-semibold text-zinc-900">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>

                <Button className="mt-6 w-full" size="lg" asChild>
                  <Link href="/checkout">Proceed to Checkout</Link>
                </Button>

                <p className="mt-4 text-center text-xs text-zinc-700">
                  Tax calculated at checkout
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Looks like you haven't added anything to your cart yet. Browse our products to find something you'll love."
          actionLabel="Browse Products"
          actionHref="/products"
        />
      )}
    </div>
  );
}
