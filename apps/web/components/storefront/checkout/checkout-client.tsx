'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingBag, Loader2, CreditCard } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PromoCodeInput } from '@/components/storefront/promo-code-input';
import { PaymentForm, PaymentMethodSelector } from '@/components/storefront/payments/payment-form';
import { TAX_RATE, type DeliveryServiceType, type CheckoutUserData } from '@/lib/types';
import { DELIVERY_SERVICE_OPTIONS } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { CheckoutFulfillment } from './checkout-fulfillment';
import { CheckoutAddressForm } from './checkout-address-form';
import { CheckoutContactForm } from './checkout-contact-form';
import { CheckoutSummary } from './checkout-summary';

interface CheckoutClientProps {
  userData?: CheckoutUserData | null;
}

type FulfillmentMethod = 'pickup' | 'delivery';
type CheckoutStep = 'info' | 'payment' | 'complete';

interface DeliveryQuote {
  distanceMiles: number;
  fee: number;
  formatted: string;
  services: DeliveryServiceType[];
  available: boolean;
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

  // Cart state for preorder items
  const hasPickupOnlyItems = items.some((item) => item.pickup_only);

  // Fulfillment state
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>(
    hasPickupOnlyItems ? 'pickup' : 'pickup'
  );
  const [deliveryAddress, setDeliveryAddress] = useState({
    street: '',
    city: '',
    state: '',
    zip: '',
  });
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Set<DeliveryServiceType>>(new Set());
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Order state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<CheckoutStep>('info');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'pickup' | 'credit_card'>('pickup');

  // Calculate totals
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = discountedSubtotal * TAX_RATE;

  // Delivery fee from services
  const servicesFee = Array.from(selectedServices).reduce((sum, service) => {
    const option = DELIVERY_SERVICE_OPTIONS.find((o) => o.service === service);
    return sum + (option?.fee || 0);
  }, 0);

  // Base delivery fee
  const deliveryFee = deliveryQuote?.fee || 0;
  const totalDeliveryFee = deliveryFee + servicesFee;

  const total = discountedSubtotal + tax + (fulfillmentMethod === 'delivery' ? totalDeliveryFee : 0);

  // Handle delivery service toggle
  const toggleService = (service: DeliveryServiceType) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(service)) {
        next.delete(service);
      } else {
        next.add(service);
      }
      return next;
    });
  };

  // Handle address input
  const handleAddressChange = (field: string, value: string) => {
    setDeliveryAddress((prev) => ({ ...prev, [field]: value }));
    setDeliveryQuote(null);
  };

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

    // Validate delivery
    if (fulfillmentMethod === 'delivery') {
      if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.zip) {
        setError('Please enter a complete delivery address');
        setIsSubmitting(false);
        return;
      }
      if (!deliveryQuote?.available) {
        setError('Delivery is not available to this address');
        setIsSubmitting(false);
        return;
      }
    }

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
      fulfillmentMethod,
      deliveryAddress: fulfillmentMethod === 'delivery' ? deliveryAddress : null,
      deliveryDistanceMiles: deliveryQuote?.distanceMiles || null,
      deliveryFee: fulfillmentMethod === 'delivery' ? totalDeliveryFee : 0,
      deliveryServices: Array.from(selectedServices),
      deliveryNotes,
    };

    try {
      // Only skip Stripe payment if paying at pickup
      // Credit card and PayPal always require Stripe payment flow
      if (paymentMethod === 'pickup') {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...customerData,
            paymentMethod: 'pickup',
            paymentStatus: 'pending',
          }),
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
          paymentMethod,
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

    setIsCompletingPayment(true);
    setError(null);

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
      router.push(`/order-confirmation/${orderId}`);
    } catch {
      setIsCompletingPayment(false);
      setError('Payment succeeded but order update failed. Please contact support.');
    }
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Cart is Empty"
        description="Add some items before checking out"
        actionLabel="Browse Products"
        actionHref="/products"
        className="mt-8"
      />
    );
  }

  // Payment step - keep 2-column layout
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

        {isCompletingPayment && (
          <div className="mb-6 flex items-center justify-center gap-3 rounded-lg bg-primary/10 p-4 text-primary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-medium">Processing your payment...</span>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left Column - Payment Form */}
          <Card className={isCompletingPayment ? 'opacity-50 pointer-events-none' : ''}>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentForm
                clientSecret={clientSecret}
                amount={total}
                onSuccess={handlePaymentSuccess}
                onError={(msg) => {
                  setError(msg);
                  setIsCompletingPayment(false);
                }}
              />
            </CardContent>
          </Card>

          {/* Right Column - Order Summary (preserves context) */}
          <div>
            <CheckoutSummary
              items={items}
              subtotal={subtotal}
              discount={discount}
              discountType={promo.discountType}
              promoCode={promo.code}
              onApplyPromo={handleApplyPromo}
              onRemovePromo={clearPromoCode}
              fulfillmentMethod={fulfillmentMethod}
              deliveryQuote={deliveryQuote ? { ...deliveryQuote, fee: totalDeliveryFee } : null}
              deliveryAddress={deliveryAddress}
              servicesFee={servicesFee}
            />
          </div>
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
        <div className="space-y-6">
          {/* Fulfillment Method */}
          <CheckoutFulfillment
            fulfillmentMethod={fulfillmentMethod}
            onMethodChange={setFulfillmentMethod}
            hasPickupOnlyItems={hasPickupOnlyItems}
          />

          {/* Delivery Address */}
          {fulfillmentMethod === 'delivery' && (
            <CheckoutAddressForm
              deliveryAddress={deliveryAddress}
              onAddressChange={handleAddressChange}
              selectedServices={selectedServices}
              onServiceToggle={toggleService}
              deliveryNotes={deliveryNotes}
              onNotesChange={setDeliveryNotes}
              onQuoteChange={setDeliveryQuote}
              deliveryQuote={deliveryQuote}
              loadingQuote={loadingQuote}
            />
          )}

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Contact Information</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <CheckoutContactForm userData={userData} />

                {error && (
                  <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {/* Payment Method Selection */}
                <div className="mt-4">
                  <PaymentMethodSelector
                    selected={paymentMethod}
                    onSelect={(method) => setPaymentMethod(method)}
                    disabled={isSubmitting}
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-14 text-lg"
                  disabled={isSubmitting || (fulfillmentMethod === 'delivery' && !deliveryQuote?.available)}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {step === 'payment' ? 'Processing Payment...' : 'Placing Order...'}
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-5 w-5" />
                      Place Order • {formatCurrency(total)}
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

        {/* Order Summary */}
        <div>
          <CheckoutSummary
            items={items}
            subtotal={subtotal}
            discount={discount}
            discountType={promo.discountType}
            promoCode={promo.code}
            onApplyPromo={handleApplyPromo}
            onRemovePromo={clearPromoCode}
            fulfillmentMethod={fulfillmentMethod}
            deliveryQuote={deliveryQuote ? { ...deliveryQuote, fee: totalDeliveryFee } : null}
            deliveryAddress={deliveryAddress}
            servicesFee={servicesFee}
          />
        </div>
      </div>
    </div>
  );
}
