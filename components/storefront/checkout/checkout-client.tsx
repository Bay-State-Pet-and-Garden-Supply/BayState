'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingBag, Loader2, CreditCard, Package } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PromoCodeInput } from '@/components/storefront/promo-code-input';
import { PaymentForm } from '@/components/storefront/payments/payment-form';
import { DELIVERY_SERVICE_OPTIONS, type DeliveryServiceType } from '@/lib/types';
import { getDeliveryQuote, type DeliveryFeeBreakdown } from '@/lib/storefront/delivery';
import { formatCurrency } from '@/lib/utils';

export interface CheckoutUserData {
  fullName: string;
  email: string;
  phone: string;
}

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

function mapBreakdownToQuote(breakdown: DeliveryFeeBreakdown): DeliveryQuote {
  return {
    distanceMiles: breakdown.distanceMiles,
    fee: breakdown.total,
    formatted: breakdown.isOutOfRange
      ? breakdown.outOfRangeMessage || 'Delivery not available'
      : breakdown.total === 0
      ? 'FREE'
      : `$${breakdown.total.toFixed(2)}`,
    services: [],
    available: !breakdown.isOutOfRange,
  };
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
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<CheckoutStep>('info');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  // Calculate totals
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = discountedSubtotal * 0.0625;

  // Delivery fee from services
  const servicesFee = Array.from(selectedServices).reduce((sum, service) => {
    const option = DELIVERY_SERVICE_OPTIONS.find((o) => o.service === service);
    return sum + (option?.fee || 0);
  }, 0);

  // Base delivery fee
  const deliveryFee = deliveryQuote?.fee || 0;
  const totalDeliveryFee = deliveryFee + servicesFee;

  const total = discountedSubtotal + tax + (fulfillmentMethod === 'delivery' ? totalDeliveryFee : 0);

  // Calculate delivery quote when address changes
  const calculateDeliveryQuote = useCallback(async () => {
    if (fulfillmentMethod !== 'delivery') return;

    const fullAddress = `${deliveryAddress.street}, ${deliveryAddress.city}, ${deliveryAddress.state} ${deliveryAddress.zip}`;
    if (!fullAddress.trim() || !deliveryAddress.zip) {
      setDeliveryQuote(null);
      return;
    }

    setLoadingQuote(true);
    try {
      const breakdown = await getDeliveryQuote(fullAddress, Array.from(selectedServices));
      setDeliveryQuote(mapBreakdownToQuote(breakdown));
    } catch {
      setDeliveryQuote({
        distanceMiles: 0,
        fee: 0,
        formatted: 'Unable to calculate delivery',
        services: [],
        available: false,
      });
    } finally {
      setLoadingQuote(false);
    }
  }, [deliveryAddress, fulfillmentMethod, selectedServices]);

  // Debounce delivery quote calculation
  useEffect(() => {
    const timer = setTimeout(calculateDeliveryQuote, 500);
    return () => clearTimeout(timer);
  }, [calculateDeliveryQuote]);

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
      if (fulfillmentMethod === 'pickup') {
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
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete payment');
      }

      clearCart();
      router.push(`/order-confirmation/${orderId}`);
    } catch {
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
                {fulfillmentMethod === 'delivery' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-700">Delivery</span>
                    <span className="font-medium">{formatCurrency(totalDeliveryFee)}</span>
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
                onError={(msg) => setError(msg)}
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
        <div className="space-y-6">
          {/* Fulfillment Method */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                How would you like to receive your order?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div
                  className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                    fulfillmentMethod === 'pickup'
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-zinc-50'
                  }`}
                  onClick={() => setFulfillmentMethod('pickup')}
                >
                  <input
                    type="radio"
                    name="fulfillmentMethod"
                    value="pickup"
                    checked={fulfillmentMethod === 'pickup'}
                    onChange={() => setFulfillmentMethod('pickup')}
                    className="h-4 w-4"
                  />
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
                  className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                    fulfillmentMethod === 'delivery'
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-zinc-50'
                  }`}
                  onClick={() => setFulfillmentMethod('delivery')}
                >
                  <input
                    type="radio"
                    name="fulfillmentMethod"
                    value="delivery"
                    checked={fulfillmentMethod === 'delivery'}
                    onChange={() => setFulfillmentMethod('delivery')}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <Label htmlFor="delivery" className="font-medium cursor-pointer">
                      Local Delivery
                    </Label>
                    <p className="text-sm text-zinc-600">
                      We deliver within 30 miles
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Delivery Address */}
          {fulfillmentMethod === 'delivery' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Delivery Address
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="street">Street Address *</Label>
                    <Input
                      id="street"
                      placeholder="123 Main St"
                      value={deliveryAddress.street}
                      onChange={(e) => handleAddressChange('street', e.target.value)}
                      className="h-12"
                      aria-describedby="street-help"
                    />
                    <p id="street-help" className="text-sm text-muted-foreground">
                      Full street address including apartment/unit number.
                    </p>
                  </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      placeholder="Worcester"
                      value={deliveryAddress.city}
                      onChange={(e) => handleAddressChange('city', e.target.value)}
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      placeholder="MA"
                      value={deliveryAddress.state}
                      onChange={(e) => handleAddressChange('state', e.target.value)}
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="zip">ZIP Code *</Label>
                    <Input
                      id="zip"
                      placeholder="01602"
                      value={deliveryAddress.zip}
                      onChange={(e) => handleAddressChange('zip', e.target.value)}
                      className="h-12"
                    />
                  </div>
                </div>

                {loadingQuote && (
                  <div className="flex items-center gap-2 text-sm text-zinc-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculating delivery options...
                  </div>
                )}

                {deliveryQuote && (
                  <div className={`rounded-lg border p-4 ${deliveryQuote.available ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    {deliveryQuote.available ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-green-800">Delivery Available</span>
                          <span className="font-bold text-green-800">{formatCurrency(deliveryQuote.fee)}</span>
                        </div>
                        <p className="text-sm text-green-700 mt-1">
                          {deliveryQuote.distanceMiles.toFixed(1)} miles from store
                        </p>
                      </>
                    ) : (
                      <p className="font-medium text-red-800">
                        {deliveryQuote.formatted || 'Delivery not available to this address'}
                      </p>
                    )}
                  </div>
                )}

                {deliveryQuote?.available && (
                  <div className="space-y-3">
                    <Label>Delivery Services (optional)</Label>
                    {DELIVERY_SERVICE_OPTIONS.map((option) => (
                      <div key={option.service} className="flex items-center space-x-3">
                        <Checkbox
                          id={`service-${option.service}`}
                          checked={selectedServices.has(option.service)}
                          onCheckedChange={() => toggleService(option.service)}
                        />
                        <Label htmlFor={`service-${option.service}`} className="text-sm cursor-pointer">
                          {option.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}

                  <div className="space-y-2">
                    <Label htmlFor="delivery_notes">Delivery Notes</Label>
                    <textarea
                      id="delivery_notes"
                      value={deliveryNotes}
                      onChange={(e) => setDeliveryNotes(e.target.value)}
                      placeholder="Gate code, leave at door, etc."
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-describedby="delivery-notes-help"
                    />
                    <p id="delivery-notes-help" className="text-sm text-muted-foreground">
                      Optional instructions for the driver (e.g., gate code, drop-off location).
                    </p>
                  </div>
              </CardContent>
            </Card>
          )}

          {/* Contact Information */}
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
                    autoComplete="tel"
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
                    aria-describedby="order-notes-help"
                  />
                  <p id="order-notes-help" className="text-sm text-muted-foreground">
                    Additional details about your order.
                  </p>
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
                  {fulfillmentMethod === 'pickup'
                    ? 'By placing this order, you agree to our terms of service. Payment will be collected at pickup.'
                    : 'Your payment is secured by Stripe. You will be charged after reviewing your order.'}
                </p>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Order Summary */}
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
                {fulfillmentMethod === 'delivery' ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-700">Delivery</span>
                      <span className="font-medium">
                        {deliveryQuote?.available ? formatCurrency(totalDeliveryFee) : 'Calculated at checkout'}
                      </span>
                    </div>
                    {selectedServices.size > 0 && (
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
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              {fulfillmentMethod === 'pickup' && (
                <div className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
                  <p className="font-medium">Store Pickup</p>
                  <p className="mt-1 text-blue-700">
                    Orders are available for pickup at our store. We&apos;ll email you when your order is ready.
                  </p>
                </div>
              )}

              {fulfillmentMethod === 'delivery' && deliveryQuote?.available && (
                <div className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
                  <p className="font-medium">Local Delivery</p>
                  <p className="mt-1 text-green-700">
                    We&apos;ll deliver to {deliveryAddress.street}, {deliveryAddress.city}.
                    {deliveryQuote.distanceMiles > 0 && ` (${deliveryQuote.distanceMiles.toFixed(1)} miles)`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
