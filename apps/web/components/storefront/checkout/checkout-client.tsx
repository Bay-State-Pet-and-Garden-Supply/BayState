'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, Loader2, CreditCard, MapPin, User, ShieldCheck } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PaymentForm, PaymentMethodSelector } from '@/components/storefront/payments/payment-form';
import { TAX_RATE, type DeliveryServiceType, type CheckoutUserData } from '@/lib/types';
import { DELIVERY_SERVICE_OPTIONS } from '@/lib/types';
import { CheckoutFulfillment } from './checkout-fulfillment';
import { CheckoutAddressForm } from './checkout-address-form';
import { CheckoutContactForm } from './checkout-contact-form';
import { CheckoutSummary } from './checkout-summary';
import { CheckoutStep } from './checkout-step';

interface CheckoutClientProps {
  userData?: CheckoutUserData | null;
}

type FulfillmentMethod = 'pickup' | 'delivery';
type StepId = 'contact' | 'fulfillment' | 'payment';

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

  // Step state
  const [activeStep, setActiveStep] = useState<StepId>('contact');
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());

  // Form data state (to persist between steps)
  const [contactData, setContactData] = useState({
    name: userData?.fullName || '',
    email: userData?.email || '',
    phone: userData?.phone || '',
    notes: '',
  });

  // Fulfillment state
  const hasPickupOnlyItems = items.some((item) => item.pickup_only);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState({
    street: '',
    city: '',
    state: 'MA',
    zip: '',
  });
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [selectedServices, setSelectedServices] = useState<Set<DeliveryServiceType>>(new Set());
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Payment state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'pickup' | 'credit_card'>('pickup');
  
  // Auto-switch payment method based on fulfillment
  useEffect(() => {
    if (fulfillmentMethod === 'delivery' && paymentMethod === 'pickup') {
      setPaymentMethod('credit_card');
    }
  }, [fulfillmentMethod, paymentMethod]);

  // Calculate totals
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = discountedSubtotal * TAX_RATE;
  const servicesFee = Array.from(selectedServices).reduce((sum, service) => {
    const option = DELIVERY_SERVICE_OPTIONS.find((o) => o.service === service);
    return sum + (option?.fee || 0);
  }, 0);
  const deliveryFee = deliveryQuote?.fee || 0;
  const totalDeliveryFee = deliveryFee + servicesFee;
  const total = discountedSubtotal + tax + (fulfillmentMethod === 'delivery' ? totalDeliveryFee : 0);

  // Step transitions
  const goToStep = (step: StepId) => {
    setActiveStep(step);
    // Scroll to top of the checkout area
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const completeStep = (step: StepId, nextStep?: StepId) => {
    setCompletedSteps(prev => new Set(prev).add(step));
    if (nextStep) {
      goToStep(nextStep);
    }
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    setContactData({
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      notes: formData.get('notes') as string,
    });
    completeStep('contact', 'fulfillment');
  };

  const handleFulfillmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fulfillmentMethod === 'delivery') {
      if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.zip) {
        setError('Please enter a complete delivery address');
        return;
      }
      if (!deliveryQuote?.available) {
        setError('Delivery is not available to this address');
        return;
      }
    }
    setError(null);
    completeStep('fulfillment', 'payment');
  };

  // Create payment intent when entering payment step
  useEffect(() => {
    if (activeStep === 'payment' && paymentMethod === 'credit_card' && !clientSecret && !isSubmitting) {
      // In a real app, you might want to wait for the user to click "Place Order" 
      // but here we follow the existing logic of preparing the intent
    }
  }, [activeStep, paymentMethod, clientSecret, isSubmitting]);

  const handleApplyPromo = async (code: string) => {
    try {
      const response = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal }),
      });
      const data = await response.json();
      if (!data.valid) return { success: false, error: data.error };
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
    if (!response.ok) throw new Error('Failed to create payment intent');
    return await response.json();
  };

  const handlePlaceOrder = async () => {
    setIsSubmitting(true);
    setError(null);

    const customerData = {
      customerName: contactData.name,
      customerEmail: contactData.email,
      customerPhone: contactData.phone,
      notes: contactData.notes,
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
      if (paymentMethod === 'pickup') {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...customerData,
            paymentMethod: 'pickup',
            paymentStatus: 'unpaid',
          }),
        });
        if (!response.ok) throw new Error('Failed to create order');
        const { order } = await response.json();
        clearCart();
        router.push(`/order-confirmation/${order.id}`);
        return;
      }

      // Credit card flow
      const orderResponse = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...customerData,
          paymentMethod,
          paymentStatus: 'authorized',
        }),
      });
      if (!orderResponse.ok) throw new Error('Failed to create order');
      const { order } = await orderResponse.json();
      setOrderId(order.id);

      const paymentData = await createPaymentIntent(order.id, customerData.customerEmail, customerData.customerName);
      setClientSecret(paymentData.clientSecret);
    } catch (err) {
      setError('There was a problem placing your order. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!orderId) return;
    setIsCompletingPayment(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/payment-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId, paymentMethod }),
      });
      if (!response.ok) throw new Error('Failed to complete payment');
      clearCart();
      router.push(`/order-confirmation/${orderId}`);
    } catch {
      setIsCompletingPayment(false);
      setError('Payment succeeded but order update failed. Please contact support.');
    }
  };

  if (items.length === 0 && !isSubmitting && !isCompletingPayment) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Looks like you haven't added any garden supplies yet."
          actionLabel="Start Shopping"
          actionHref="/products"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <main className="max-w-7xl mx-auto px-4 pt-4 pb-8 lg:pt-6 lg:pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Left Column: Checkout Steps */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              
              {/* Step 1: Contact */}
              <CheckoutStep
                number={1}
                title="Contact Information"
                isOpen={activeStep === 'contact'}
                isCompleted={completedSteps.has('contact')}
                onEdit={() => goToStep('contact')}
                summary={
                  <div className="flex flex-col sm:flex-row sm:gap-6">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>{contactData.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-300 hidden sm:inline">|</span>
                      <span>{contactData.email}</span>
                    </div>
                  </div>
                }
              >
                <form onSubmit={handleContactSubmit} className="space-y-6 max-w-2xl">
                  <CheckoutContactForm userData={userData} />
                  <Button type="submit" size="lg" className="h-14 px-8 text-lg font-bold">
                    Save & Continue
                  </Button>
                </form>
              </CheckoutStep>

              {/* Step 2: Fulfillment */}
              <CheckoutStep
                number={2}
                title="Fulfillment Method"
                isOpen={activeStep === 'fulfillment'}
                isCompleted={completedSteps.has('fulfillment')}
                onEdit={() => goToStep('fulfillment')}
                summary={
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{fulfillmentMethod === 'pickup' ? 'Store Pickup (Taunton, MA)' : `Delivery to ${deliveryAddress.street}, ${deliveryAddress.city}`}</span>
                  </div>
                }
              >
                <form onSubmit={handleFulfillmentSubmit} className="space-y-8">
                  <CheckoutFulfillment
                    fulfillmentMethod={fulfillmentMethod}
                    onMethodChange={setFulfillmentMethod}
                    hasPickupOnlyItems={hasPickupOnlyItems}
                  />

                  {fulfillmentMethod === 'delivery' && (
                    <CheckoutAddressForm
                      deliveryAddress={deliveryAddress}
                      onAddressChange={(field, value) => setDeliveryAddress(prev => ({ ...prev, [field]: value }))}
                      selectedServices={selectedServices}
                      onServiceToggle={(service) => setSelectedServices(prev => {
                        const next = new Set(prev);
                        if (next.has(service)) next.delete(service); else next.add(service);
                        return next;
                      })}
                      deliveryNotes={deliveryNotes}
                      onNotesChange={setDeliveryNotes}
                      onQuoteChange={setDeliveryQuote}
                      deliveryQuote={deliveryQuote}
                      loadingQuote={false}
                    />
                  )}

                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <Button type="submit" size="lg" className="h-14 px-8 text-lg font-bold">
                      Continue to Payment
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => goToStep('contact')} className="h-14 font-semibold">
                      Back to Contact Info
                    </Button>
                  </div>
                </form>
              </CheckoutStep>

              {/* Step 3: Payment */}
              <CheckoutStep
                number={3}
                title="Payment"
                isOpen={activeStep === 'payment'}
                isCompleted={completedSteps.has('payment')}
                onEdit={() => {}} // Can't edit payment once processing
              >
                <div className="space-y-6">
                  {clientSecret ? (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        <p className="text-sm font-medium">Your payment is secured and processed by Stripe.</p>
                      </div>

                      <PaymentForm
                        clientSecret={clientSecret}
                        amount={total}
                        onSuccess={handlePaymentSuccess}
                        onError={(msg) => {
                          setError(msg);
                          setIsCompletingPayment(false);
                          setClientSecret(null); // Allow retry
                        }}
                      />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <PaymentMethodSelector
                        selected={paymentMethod}
                        onSelect={setPaymentMethod}
                        disabled={isSubmitting}
                        fulfillmentMethod={fulfillmentMethod}
                      />

                      {error && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm font-medium">
                          {error}
                        </div>
                      )}

                      {!clientSecret && (
                        <div className="flex flex-col sm:flex-row gap-4">
                          <Button 
                            onClick={handlePlaceOrder} 
                            size="lg" 
                            className="h-14 px-8 text-lg font-bold"
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? (
                              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing...</>
                            ) : (
                              paymentMethod === 'pickup' ? 'Complete Order' : 'Review & Pay'
                            )}
                          </Button>
                          <Button variant="ghost" onClick={() => goToStep('fulfillment')} className="h-14 font-semibold" disabled={isSubmitting}>
                            Back to Fulfillment
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {(isCompletingPayment || (isSubmitting && paymentMethod === 'pickup')) && (
                    <div className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center gap-6">
                      <div className="relative">
                        <div className="h-20 w-20 rounded-full border-4 border-primary/20" />
                        <div className="absolute top-0 h-20 w-20 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ShoppingBag className="h-8 w-8 text-primary animate-pulse" />
                        </div>
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-2xl font-display font-bold text-zinc-900">
                          {isCompletingPayment ? 'Completing your order...' : 'Processing your order...'}
                        </p>
                        <p className="text-muted-foreground font-medium">Please do not refresh or close this window.</p>
                      </div>
                    </div>
                  )}
                </div>
              </CheckoutStep>
            </div>
          </div>

          {/* Right Column: Order Summary */}
          <div className="lg:col-span-4">
            <CheckoutSummary
              items={items}
              subtotal={subtotal}
              discount={discount}
              discountType={promo.discountType}
              promoCode={promo.code}
              onApplyPromo={handleApplyPromo}
              onRemovePromo={clearPromoCode}
              fulfillmentMethod={fulfillmentMethod}
              deliveryQuote={deliveryQuote}
              deliveryAddress={deliveryAddress}
              servicesFee={servicesFee}
            />
          </div>
        </div>
      </main>

      {/* Footer / Trust Footer */}
      <footer className="bg-white border-t border-border mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-4">
           <div className="flex items-center gap-8 opacity-50">
             <span className="text-xs font-bold uppercase tracking-widest">Free Pickup</span>
             <span className="text-xs font-bold uppercase tracking-widest">Quality Guarantee</span>
             <span className="text-xs font-bold uppercase tracking-widest">Safe Payment</span>
           </div>
           <p className="text-xs text-muted-foreground">© 2026 Bay State Pet & Garden Supply. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
