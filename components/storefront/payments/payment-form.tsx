'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CreditCard, Shield } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'
);

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
      <div className="rounded-lg border p-4">
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {message && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
          {message}
        </div>
      )}

      <Button
        type="submit"
        className="w-full h-14 text-lg"
        disabled={!stripe || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-5 w-5" />
            Pay {formatCurrency(amount)}
          </>
        )}
      </Button>

      <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
        <Shield className="h-4 w-4" />
        <span>Secured by Stripe</span>
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
  const appearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#008850',
      colorBackground: '#ffffff',
      colorText: '#1f2937',
      colorDanger: '#dc2626',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      spacingUnit: '4px',
      borderRadius: '8px',
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
}: {
  selected: 'pickup' | 'credit_card' | 'paypal';
  onSelect: (method: 'pickup' | 'credit_card' | 'paypal') => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-zinc-700">
        Payment Method
      </label>
      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => onSelect('credit_card')}
          disabled={disabled}
          className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            selected === 'credit_card'
              ? 'border-primary bg-primary/5'
              : 'border-zinc-200 hover:border-zinc-300'
          }`}
        >
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              selected === 'credit_card' ? 'bg-primary text-white' : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-zinc-900">Credit Card</p>
            <p className="text-sm text-zinc-500">Visa, Mastercard, Amex</p>
          </div>
          {selected === 'credit_card' && (
            <div className="h-3 w-3 rounded-full bg-primary" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelect('paypal')}
          disabled={disabled}
          className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            selected === 'paypal'
              ? 'border-primary bg-primary/5'
              : 'border-zinc-200 hover:border-zinc-300'
          }`}
        >
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              selected === 'paypal' ? 'bg-primary text-white' : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.59 3.025-2.566 4.643-5.813 4.643h-2.189c-1.05 0-1.934.762-2.101 1.803l-1.12 7.106a.641.641 0 0 0 .633.74h3.064c.459 0 .85-.332.923-.783l.038-.208.73-4.614.047-.244a.93.93 0 0 1 .92-.784h.578c3.76 0 6.705-1.528 7.566-5.946.36-1.847.174-3.388-.633-4.368z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-medium text-zinc-900">PayPal</p>
            <p className="text-sm text-zinc-500">Pay with your PayPal account</p>
          </div>
          {selected === 'paypal' && (
            <div className="h-3 w-3 rounded-full bg-primary" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelect('pickup')}
          disabled={disabled}
          className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            selected === 'pickup'
              ? 'border-primary bg-primary/5'
              : 'border-zinc-200 hover:border-zinc-300'
          }`}
        >
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              selected === 'pickup' ? 'bg-primary text-white' : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-medium text-zinc-900">Pay at Pickup</p>
            <p className="text-sm text-zinc-500">Pay when you collect your order</p>
          </div>
          {selected === 'pickup' && (
            <div className="h-3 w-3 rounded-full bg-primary" />
          )}
        </button>
      </div>
    </div>
  );
}
