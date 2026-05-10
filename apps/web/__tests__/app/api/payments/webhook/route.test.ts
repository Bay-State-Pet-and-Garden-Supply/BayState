/**
 * @jest-environment node
 */

import { POST } from '@/app/api/payments/webhook/route';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockConstructWebhookEvent = jest.fn();
const mockClaimWebhookEvent = jest.fn();
const mockHandlePaymentIntentSucceeded = jest.fn();
const mockHandlePaymentIntentFailed = jest.fn();
const mockHandlePaymentIntentCanceled = jest.fn();
const mockHandleChargeRefunded = jest.fn();
const mockFinalizeWebhookEvent = jest.fn();

jest.mock('@/lib/payments/stripe', () => ({
  constructWebhookEvent: (...args: unknown[]) => mockConstructWebhookEvent(...args),
}));

jest.mock('@/lib/payments/order-payment-reconciliation', () => ({
  claimWebhookEvent: (...args: unknown[]) => mockClaimWebhookEvent(...args),
  handlePaymentIntentSucceeded: (...args: unknown[]) => mockHandlePaymentIntentSucceeded(...args),
  handlePaymentIntentFailed: (...args: unknown[]) => mockHandlePaymentIntentFailed(...args),
  handlePaymentIntentCanceled: (...args: unknown[]) => mockHandlePaymentIntentCanceled(...args),
  handleChargeRefunded: (...args: unknown[]) => mockHandleChargeRefunded(...args),
  finalizeWebhookEvent: (...args: unknown[]) => mockFinalizeWebhookEvent(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...OLD_ENV };
  jest.clearAllMocks();
});

afterEach(() => {
  process.env = OLD_ENV;
});

function createMockRequest(
  body: string,
  signature: string | null = 'test_sig'
): NextRequest {
  return {
    text: () => Promise.resolve(body),
    headers: new Map(
      Object.entries({
        'stripe-signature': signature,
        'content-type': 'application/json',
      })
    ),
  } as unknown as NextRequest;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/payments/webhook', () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    mockClaimWebhookEvent.mockResolvedValue('new');
    mockHandlePaymentIntentSucceeded.mockResolvedValue({
      updated: true,
      orderId: 'order-1',
      previousStatus: 'unpaid',
      newStatus: 'paid',
      eventId: 'evt_1',
    });
    mockHandlePaymentIntentFailed.mockResolvedValue({
      updated: true,
      orderId: 'order-1',
      previousStatus: 'unpaid',
      newStatus: 'failed',
      eventId: 'evt_2',
    });
    mockHandlePaymentIntentCanceled.mockResolvedValue({
      updated: true,
      orderId: 'order-1',
      previousStatus: 'unpaid',
      newStatus: 'voided',
      eventId: 'evt_3',
    });
    mockHandleChargeRefunded.mockResolvedValue({
      updated: true,
      orderId: 'order-1',
      previousStatus: 'paid',
      newStatus: 'refunded',
      eventId: 'evt_4',
    });
  });

  it('returns 500 when webhook secret is not configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    // Re-require module to pick up new env
    jest.resetModules();
    const { POST: PostNoSecret } = await import('@/app/api/payments/webhook/route');

    const req = createMockRequest('{}', 'sig');
    const res = await PostNoSecret(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('not configured');
  });

  it('returns 400 when stripe-signature header is missing', async () => {
    const req = createMockRequest('{}', null);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing');
  });

  it('returns 400 when signature is invalid', async () => {
    mockConstructWebhookEvent.mockImplementation(() => {
      const err = new Error('Invalid signature') as Error & { name: string };
      err.name = 'StripeSignatureVerificationError';
      throw err;
    });

    const req = createMockRequest('{}', 'bad_sig');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid signature');
  });

  it('returns 200 for duplicate event without processing', async () => {
    mockConstructWebhookEvent.mockResolvedValue({
      id: 'evt_duplicate',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_1',
          metadata: { order_id: 'order-1' },
          amount: 7999,
          amount_received: 7999,
          currency: 'usd',
          latest_charge: 'ch_1',
        },
      },
    });
    mockClaimWebhookEvent.mockResolvedValue('duplicate');

    const req = createMockRequest(JSON.stringify({}), 'valid_sig');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.duplicate).toBe(true);

    // Should not process
    expect(mockHandlePaymentIntentSucceeded).not.toHaveBeenCalled();
  });

  it('handles payment_intent.succeeded event', async () => {
    mockConstructWebhookEvent.mockResolvedValue({
      id: 'evt_success',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_success',
          metadata: { order_id: 'order-1' },
          amount: 7999,
          amount_received: 7999,
          currency: 'usd',
          latest_charge: 'ch_success',
        },
      },
    });

    const req = createMockRequest(JSON.stringify({}), 'valid_sig');
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockHandlePaymentIntentSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pi_success' }),
      'evt_success'
    );
  });

  it('handles payment_intent.payment_failed event', async () => {
    mockConstructWebhookEvent.mockResolvedValue({
      id: 'evt_fail',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_fail',
          metadata: { order_id: 'order-2' },
          last_payment_error: { message: 'Card declined' },
        },
      },
    });

    const req = createMockRequest(JSON.stringify({}), 'valid_sig');
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockHandlePaymentIntentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pi_fail' }),
      'evt_fail'
    );
  });

  it('handles payment_intent.canceled event', async () => {
    mockConstructWebhookEvent.mockResolvedValue({
      id: 'evt_cancel',
      type: 'payment_intent.canceled',
      data: {
        object: {
          id: 'pi_cancel',
          metadata: { order_id: 'order-3' },
        },
      },
    });

    const req = createMockRequest(JSON.stringify({}), 'valid_sig');
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockHandlePaymentIntentCanceled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pi_cancel' }),
      'evt_cancel'
    );
  });

  it('handles charge.refunded event', async () => {
    mockConstructWebhookEvent.mockResolvedValue({
      id: 'evt_refund',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_refund',
          payment_intent: 'pi_refund',
          amount_refunded: 7999,
          currency: 'usd',
        },
      },
    });

    const req = createMockRequest(JSON.stringify({}), 'valid_sig');
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockHandleChargeRefunded).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ch_refund' }),
      'evt_refund'
    );
  });

  it('skips unhandled event types', async () => {
    mockConstructWebhookEvent.mockResolvedValue({
      id: 'evt_unknown',
      type: 'unknown.event.type',
      data: {
        object: { id: 'obj_1' },
      },
    });

    const req = createMockRequest(JSON.stringify({}), 'valid_sig');
    const res = await POST(req);
    expect(res.status).toBe(200);

    // None of the handlers should have been called
    expect(mockHandlePaymentIntentSucceeded).not.toHaveBeenCalled();
    expect(mockHandlePaymentIntentFailed).not.toHaveBeenCalled();
    expect(mockHandlePaymentIntentCanceled).not.toHaveBeenCalled();
    expect(mockHandleChargeRefunded).not.toHaveBeenCalled();
  });

  it('retries a previously failed event', async () => {
    mockConstructWebhookEvent.mockResolvedValue({
      id: 'evt_retry',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_retry',
          metadata: { order_id: 'order-1' },
          amount: 7999,
          amount_received: 7999,
          currency: 'usd',
          latest_charge: 'ch_retry',
        },
      },
    });
    mockClaimWebhookEvent.mockResolvedValue('retry');

    const req = createMockRequest(JSON.stringify({}), 'valid_sig');
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockHandlePaymentIntentSucceeded).toHaveBeenCalled();
  });
});
