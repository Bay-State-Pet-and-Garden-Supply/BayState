'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingBag, Loader2, CreditCard } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PromoCodeInput } from '@/components/storefront/promo-code-input';
import { PaymentForm, PaymentMethodSelector } from '@/components/storefront/payments/payment-form';

export interface CheckoutUserData {
  fullName: string;
  email: string;
  phone: string;
}

interface CheckoutClientProps {
  userData?: CheckoutUserData | null;
}

export function CheckoutClient({ userData }: CheckoutClientProps) {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore((state) => state.getSubtotal());
  const clearCart = useCartStore((state) => state.clearCart);
  const promo = useCartStore((state) => state.promo);
  const applyPromoCode = useCartStore((state) => state.applyPromoCode);
  const clearPromoCode = useCartStore((state) => state.clearPromoCode);
  const discount = useCartStore((state) => state.getDiscount());
  const hasFreeShipping = useCartStore((state) => state.hasFreeShipping());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'pickup' | 'credit_card' | 'paypal'>('pickup');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [step, setStep] = useState<'info' | 'payment' | 'complete'>('info');

  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = discountedSubtotal * 0.0625;
  const total = discountedSubtotal + tax;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

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

  const createPaymentIntent = async (orderId: string, email: string, name: string) => {
    const response = await fetch('/api/payments/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: total,
        customerEmail: email,
        customerName: name,
        orderId,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create payment intent');
    }

    const data = await response.json();
    return data;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const customerData = {
      customerName: formData.get('name') as string,
      customerEmail: formData.get('email') as string,
      customerPhone: formData.get('phone') as string,
      notes: formData.get('notes') as string,
      items,
      promoCode: promo.code,
      promoCodeId: promo.promoCodeId,
      discountAmount: discount,
      paymentMethod: paymentMethod,
    };

    try {
      if (paymentMethod === 'pickup') {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(customerData),
        });

        if (!response.ok) {
          throw new Error('Failed to create order');
        }

        const { order } = await response.json();
        clearCart();
        router.push(`/order-confirmation/${order.id}`);
        return;
      }

      const orderResponse = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...customerData,
          paymentStatus: 'processing',
        }),
      });

      if (!orderResponse.ok) {
        throw new Error('Failed to create order');
      }

      const { order } = await orderResponse.json();
      setOrderId(order.id);

      const paymentData = await createPaymentIntent(order.id, customerData.customerEmail, customerData.customerName);
      setClientSecret(paymentData.clientSecret);
      setStep('payment');
    } catch {
      setError('There was a problem placing your order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!orderId) return;

    try {
      const response = await fetch(`/api/orders/${orderId}/payment-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId,
          paymentMethod,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete payment');
      }

      clearCart();
      setStep('complete');
      router.push(`/order-confirmation/${orderId}`);
    } catch {
      setError('Payment succeeded but order update failed. Please contact support.');
    }
  };

  const handlePaymentError = (errorMessage: string) => {
    setError(errorMessage);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <ShoppingBag className="mb-4 h-20 w-20 text-secondary" />
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">Cart is Empty</h1>
        <p className="mb-6 text-zinc-700">Add some items before checking out</p>
        <Button size="lg" asChild>
          <Link href="/products">Browse Products</Link>
        </Button>
      </div>
    );
  }

  if (step === 'payment' && clientSecret) {
    return (
      <div className="w-full px-4 py-8">
        <button
          onClick={() => setStep('info')}
          className="mb-6 inline-flex items-center text-sm text-zinc-700 hover:text-zinc-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Checkout
        </button>

        <h1 className="mb-8 text-3xl font-bold text-zinc-900">Complete Payment</h1>

        <div className="max-w-lg mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id} className="flex justify-between py-3">
                    <div>
                      <p className="font-medium text-zinc-900">{item.name}</p>
                      <p className="text-sm text-zinc-700">Qty: {item.quantity}</p>
                    </div>
                    <p className="font-medium text-zinc-900">
                      {formatCurrency(item.price * item.quantity)}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="mt-4 space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-700">Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount ({promo.code})</span>
                    <span className="font-medium">-{formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-700">Tax (6.25%)</span>
                  <span className="font-medium">{formatCurrency(tax)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentForm
                clientSecret={clientSecret}
                amount={total}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-8">
      <Link
        href="/cart"
        className="mb-6 inline-flex items-center text-sm text-zinc-700 hover:text-zinc-900"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Cart
      </Link>

      <h1 className="mb-8 text-3xl font-bold text-zinc-900">Checkout</h1>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Contact Information</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="John Smith"
                    required
                    className="h-12"
                    defaultValue={userData?.fullName || ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="john@example.com"
                    required
                    className="h-12"
                    defaultValue={userData?.email || ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    className="h-12"
                    defaultValue={userData?.phone || ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Order Notes (optional)</Label>
                  <textarea
                    id="notes"
                    name="notes"
                    placeholder="Any special instructions..."
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>

                <div className="mt-6">
                  <PaymentMethodSelector
                    selected={paymentMethod}
                    onSelect={setPaymentMethod}
                    disabled={isSubmitting}
                  />
                </div>

                {error && (
                  <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-14 text-lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {step === 'payment' ? 'Processing Payment...' : 'Placing Order...'}
                    </>
                  ) : paymentMethod === 'pickup' ? (
                    `Place Order • ${formatCurrency(total)}`
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-5 w-5" />
                      Continue to Payment • {formatCurrency(total)}
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-zinc-700">
                  {paymentMethod === 'pickup'
                    ? 'By placing this order, you agree to our terms of service. Payment will be collected at pickup.'
                    : 'Your payment is secured by Stripe. You will be charged after reviewing your order.'}
                </p>
              </form>
            </CardContent>
          </Card>
        </div>

        <div>
            <Card className="sticky top-24">
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
                  appliedCode={promo.code}
                  discount={discount}
                  discountType={promo.discountType}
                  onApply={handleApplyPromo}
                  onRemove={clearPromoCode}
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
                    <span>Discount ({promo.code})</span>
                    <span className="font-medium">-{formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-700">Shipping</span>
                  <span className="font-medium">
                    {hasFreeShipping ? (
                      <span className="text-green-600">FREE</span>
                    ) : (
                      'Pickup'
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-700">Tax (6.25%)</span>
                  <span className="font-medium">{formatCurrency(tax)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <div className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
                <p className="font-medium">Pickup Only</p>
                <p className="mt-1 text-blue-700">
                  Orders are available for pickup at our store.
                  We&apos;ll email you when your order is ready.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
