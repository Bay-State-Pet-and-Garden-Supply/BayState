import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Server-side Stripe client creation
// ---------------------------------------------------------------------------

const STRIPE_API_VERSION = '2025-12-15.clover' as Stripe.LatestApiVersion;

/**
 * Returns a Stripe server client using STRIPE_SECRET_KEY.
 * Throws a clear error if the secret key is missing or looks like a placeholder.
 * In non-production environments, rejects live (sk_live_) keys to prevent
 * accidental charges against real cards.
 */
export function getStripeServerClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Payment processing is unavailable.'
    );
  }

  if (key === 'sk_test_placeholder' || key === 'sk_test_replace_with_your_secret_key') {
    throw new Error(
      'STRIPE_SECRET_KEY is set to a placeholder value. Replace it with a real test-mode secret key ' +
      'from https://dashboard.stripe.com/test/apikeys'
    );
  }

  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  if (!isProduction && key.startsWith('sk_live_')) {
    throw new Error(
      'STRIPE_SECRET_KEY is a live (production) key. Local development must use test-mode keys (sk_test_). ' +
      'Set STRIPE_SECRET_KEY to a test-mode key from https://dashboard.stripe.com/test/apikeys'
    );
  }

  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
}

// ---------------------------------------------------------------------------
// Publishable key (safe for browser)
// ---------------------------------------------------------------------------

/**
 * Returns the Stripe publishable key for the browser.
 * Returns null (not a placeholder) when the key is missing or looks fake,
 * so the UI can gracefully disable card payment instead of mounting Stripe
 * Elements with an invalid key.
 */
export function getStripePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!key) return '';
  if (key === 'pk_test_placeholder' || key === 'pk_test_replace_with_your_publishable_key') return '';
  if (key === 'pk_test_your_publishable_key') return '';

  return key;
}

/**
 * Returns true when a real Stripe publishable key is available.
 * Components should check this before mounting Stripe Elements.
 */
export function hasStripePublishableKey(): boolean {
  return getStripePublishableKey() !== '';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert dollars to cents (Stripe uses integer cents). */
function centsFromDollars(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert cents back to dollars. */
export function dollarsFromCents(cents: number): number {
  return cents / 100;
}

/**
 * Build a Stripe idempotency key for a PaymentIntent creation.
 * Using the same key for the same order prevents duplicate PaymentIntents
 * on retry.
 */
function paymentIntentIdempotencyKey(orderId: string): string {
  return `pi:${orderId}`;
}

// ---------------------------------------------------------------------------
// PaymentIntent creation with idempotency
// ---------------------------------------------------------------------------

export interface CreatePaymentIntentParams {
  orderId?: string;
  orderNumber?: string;
  amount: number; // dollars
  currency?: string;
  customerEmail: string;
  customerName: string;
  customerId?: string;
  metadata?: Record<string, string>;
}

/**
 * Creates a PaymentIntent with server-authoritative amount and idempotency key.
 * The amount is computed server-side (not client-provided).
 * The idempotency key prevents duplicate PaymentIntents on retry.
 */
export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeServerClient();

  const {
    orderId,
    orderNumber,
    amount,
    currency = 'usd',
    customerEmail,
    customerName,
    customerId,
    metadata = {},
  } = params;

  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

  const idempotencyKey = orderId ? paymentIntentIdempotencyKey(orderId) : undefined;

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: centsFromDollars(amount),
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      customer: customerId,
      receipt_email: customerEmail,
      metadata: {
        order_id: orderId || '',
        order_number: orderNumber || '',
        customer_email: customerEmail,
        customer_name: customerName,
        environment,
        ...metadata,
      },
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return paymentIntent;
}

// ---------------------------------------------------------------------------
// Retrieve / Cancel / Refund
// ---------------------------------------------------------------------------

export async function retrievePaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeServerClient();
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

async function cancelPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeServerClient();
  return await stripe.paymentIntents.cancel(paymentIntentId);
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

async function createRefund(
  paymentIntentId: string,
  amount?: number // in dollars; if omitted, full refund
): Promise<Stripe.Refund> {
  const stripe = getStripeServerClient();
  const params: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
  };
  if (amount !== undefined) {
    params.amount = centsFromDollars(amount);
  }
  return await stripe.refunds.create(params);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

async function createStripeCustomer(
  email: string,
  name: string,
  metadata?: Record<string, string>
): Promise<Stripe.Customer> {
  const stripe = getStripeServerClient();
  return await stripe.customers.create({ email, name, metadata });
}

async function getStripeCustomerByEmail(
  email: string
): Promise<Stripe.Customer | null> {
  const stripe = getStripeServerClient();
  const customers = await stripe.customers.list({ email, limit: 1 });
  return customers.data[0] || null;
}

export async function getOrCreateStripeCustomer(input: {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  const existing = await getStripeCustomerByEmail(input.email);
  if (existing) return existing;
  return createStripeCustomer(input.email, input.name, input.metadata);
}

export async function createEphemeralKey(
  customerId: string
): Promise<Stripe.EphemeralKey> {
  const stripe = getStripeServerClient();
  return stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: STRIPE_API_VERSION }
  );
}

// ---------------------------------------------------------------------------
// Webhook event construction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Webhook event construction
// ---------------------------------------------------------------------------

/**
 * Constructs a Stripe webhook event from a raw payload and signature.
 * This does NOT require a valid STRIPE_SECRET_KEY — constructEvent only
 * needs the webhook signing secret to verify the signature.
 * The webhook route should call this before requiring any API-key-dependent
 * operations.
 *
 * Rejects known placeholder webhook secrets with a clear error.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  if (
    !webhookSecret ||
    webhookSecret === 'whsec_replace_me_from_stripe_cli'
  ) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET is not set to a real value. ' +
      'Run `stripe listen --forward-to http://localhost:3000/api/payments/webhook` ' +
      'and copy the whsec_... secret into your .env.local'
    );
  }

  // Create a minimal Stripe instance solely for signature verification.
  // The API key is irrelevant for constructEvent.
  const key = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_for_webhook_construction';
  const stripe = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
