'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, Shield, Banknote, AlertTriangle } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { getStripePublishableKey, hasStripePublishableKey } from '@/lib/payments/stripe';

const stripePromise = hasStripePublishableKey()
  ? loadStripe(getStripePublishableKey()!)
  : null;

interface PaymentFormProps {
  clientSecret: string;
  amount: number;
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
}

function PaymentFormContent({
  amount,
  onSuccess,
  onError,
}: Omit<PaymentFormProps, 'clientSecret'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment/result`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setMessage(error.message || 'An error occurred during payment.');
      onError(error.message || 'Payment failed');
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    }

    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-border p-6 bg-white shadow-inner">
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {message && (
        <div className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-600 border border-red-100">
          {message}
        </div>
      )}

      <Button
        type="submit"
        className="w-full h-16 text-xl font-bold"
        disabled={!stripe || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-6 w-6" />
            Pay {formatCurrency(amount)}
          </>
        )}
      </Button>

      <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
        <Shield className="h-4 w-4" />
        <span>Secured by Stripe SSL Encryption</span>
      </div>
    </form>
  );
}

export function PaymentForm({
  clientSecret,
  amount,
  onSuccess,
  onError,
}: PaymentFormProps) {
  // If Stripe publishable key is not configured, show a clear error
  if (!stripePromise) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
          <p className="text-base font-bold text-amber-800">Stripe Not Configured</p>
        </div>
        <p className="text-sm text-amber-700">
          Credit card payments require a Stripe publishable key.
          Set <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs font-mono">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>
          in your <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs font-mono">.env.local</code> file.
        </p>
        <p className="text-sm text-amber-600 mt-2">
          Pickup / pay-at-store orders still work without Stripe.
        </p>
      </div>
    );
  }

  const appearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: 'hsl(var(--primary))',
      colorBackground: 'hsl(var(--card))',
      colorText: 'hsl(var(--foreground))',
      colorDanger: 'hsl(var(--destructive))',
      fontFamily: 'Arvo, serif',
      spacingUnit: '5px',
      borderRadius: '12px',
    },
  };

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <PaymentFormContent amount={amount} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}

export function PaymentMethodSelector({
  selected,
  onSelect,
  disabled,
  fulfillmentMethod = 'pickup',
}: {
  selected: 'pickup' | 'credit_card';
  onSelect: (method: 'pickup' | 'credit_card') => void;
  disabled?: boolean;
  fulfillmentMethod?: 'pickup' | 'delivery';
}) {
  const isDelivery = fulfillmentMethod === 'delivery';
  return (
    <div className="space-y-4">
      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Select Payment Method
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          onClick={() => !disabled && onSelect('credit_card')}
          className={cn(
            "relative flex cursor-pointer flex-col gap-4 rounded-xl border-2 p-6 transition-all",
            selected === 'credit_card'
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-card hover:border-zinc-300",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="flex items-center justify-between">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300",
              selected === 'credit_card' 
                ? "bg-brand-forest-green text-white shadow-md scale-110" 
                : "bg-muted text-muted-foreground"
            )}>
              <CreditCard className="h-6 w-6" />
            </div>
          </div>
          <div>
            <p className="text-base font-bold">Credit / Debit Card</p>
            <p className="text-sm text-muted-foreground mt-1">
              Pay securely via Stripe.
            </p>
          </div>
        </div>

        <div
          onClick={() => !disabled && !isDelivery && onSelect('pickup')}
          className={cn(
            "relative flex cursor-pointer flex-col gap-4 rounded-xl border-2 p-6 transition-all",
            selected === 'pickup'
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-card hover:border-zinc-300",
            (disabled || isDelivery) && "opacity-50 cursor-not-allowed grayscale"
          )}
        >
          <div className="flex items-center justify-between">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300",
              selected === 'pickup' 
                ? "bg-brand-forest-green text-white shadow-md scale-110" 
                : "bg-muted text-muted-foreground"
            )}>
              <Banknote className="h-6 w-6" />
            </div>
          </div>
          <div>
            <p className="text-base font-bold">Pay at Pickup</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isDelivery ? 'Not available for delivery orders.' : 'Cash or card at the store.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
