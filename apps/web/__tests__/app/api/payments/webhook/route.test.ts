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
// Global env setup
// ---------------------------------------------------------------------------

const OLD_STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

afterAll(() => {
  if (OLD_STRIPE_WEBHOOK_SECRET) {
    process.env.STRIPE_WEBHOOK_SECRET = OLD_STRIPE_WEBHOOK_SECRET;
  } else {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  mockClaimWebhookEvent.mockResolvedValue('new');
  mockHandlePaymentIntentSucceeded.mockResolvedValue({
    updated: true, orderId: 'order-1', previousStatus: 'unpaid', newStatus: 'paid', eventId: 'evt_1',
  });
  mockHandlePaymentIntentFailed.mockResolvedValue({
    updated: true, orderId: 'order-1', previousStatus: 'unpaid', newStatus: 'failed', eventId: 'evt_2',
  });
  mockHandlePaymentIntentCanceled.mockResolvedValue({
    updated: true, orderId: 'order-1', previousStatus: 'unpaid', newStatus: 'voided', eventId: 'evt_3',
  });
  mockHandleChargeRefunded.mockResolvedValue({
    updated: true, orderId: 'order-1', previousStatus: 'paid', newStatus: 'refunded', eventId: 'evt_4',
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createMockRequest(body: string, signature: string | null = 'test_sig'): NextRequest {
  return {
    text: () => Promise.resolve(body),
    headers: {
      get: (name: string) => {
        if (name === 'stripe-signature') return signature;
        return null;
      },
    },
  } as unknown as NextRequest;
}

function makePaymentIntentEvent(
  id: string,
  type: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    type,
    data: {
      object: {
        id: 'pi_' + id,
        metadata: { order_id: 'order-1' },
        amount: 7999,
        amount_received: 7999,
        currency: 'usd',
        latest_charge: 'ch_' + id,
        ...overrides,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/payments/webhook', () => {
  describe('configuration checks', () => {
    it('returns 500 when webhook secret is not configured', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      try {
        const req = createMockRequest('{}', 'sig');
        const res = await POST(req);
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toContain('not configured');
      } finally {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
      }
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
  });

  describe('event processing', () => {
    beforeEach(() => {
      // Default: constructWebhookEvent returns a valid event
      mockConstructWebhookEvent.mockImplementation(
        (_body: string, _sig: string, _secret: string) =>
          makePaymentIntentEvent('evt_default', 'payment_intent.succeeded')
      );
    });

    it('returns 200 for duplicate event without processing', async () => {
      mockConstructWebhookEvent.mockReturnValue(
        makePaymentIntentEvent('evt_duplicate', 'payment_intent.succeeded')
      );
      mockClaimWebhookEvent.mockResolvedValue('duplicate');

      const req = createMockRequest(JSON.stringify({}), 'valid_sig');
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
      expect(body.duplicate).toBe(true);

      expect(mockHandlePaymentIntentSucceeded).not.toHaveBeenCalled();
    });

    it('handles payment_intent.succeeded event', async () => {
      mockConstructWebhookEvent.mockReturnValue(
        makePaymentIntentEvent('evt_success', 'payment_intent.succeeded')
      );

      const req = createMockRequest(JSON.stringify({}), 'valid_sig');
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockHandlePaymentIntentSucceeded).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pi_evt_success' }),
        'evt_success'
      );
    });

    it('handles payment_intent.payment_failed event', async () => {
      mockConstructWebhookEvent.mockReturnValue(
        makePaymentIntentEvent('evt_fail', 'payment_intent.payment_failed')
      );

      const req = createMockRequest(JSON.stringify({}), 'valid_sig');
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockHandlePaymentIntentFailed).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pi_evt_fail' }),
        'evt_fail'
      );
    });

    it('handles payment_intent.canceled event', async () => {
      mockConstructWebhookEvent.mockReturnValue(
        makePaymentIntentEvent('evt_cancel', 'payment_intent.canceled')
      );

      const req = createMockRequest(JSON.stringify({}), 'valid_sig');
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockHandlePaymentIntentCanceled).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pi_evt_cancel' }),
        'evt_cancel'
      );
    });

    it('handles charge.refunded event', async () => {
      mockConstructWebhookEvent.mockReturnValue({
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
      mockConstructWebhookEvent.mockReturnValue({
        id: 'evt_unknown',
        type: 'unknown.event.type',
        data: {
          object: { id: 'obj_1' },
        },
      });

      const req = createMockRequest(JSON.stringify({}), 'valid_sig');
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockHandlePaymentIntentSucceeded).not.toHaveBeenCalled();
      expect(mockHandlePaymentIntentFailed).not.toHaveBeenCalled();
      expect(mockHandlePaymentIntentCanceled).not.toHaveBeenCalled();
      expect(mockHandleChargeRefunded).not.toHaveBeenCalled();
      expect(mockFinalizeWebhookEvent).toHaveBeenCalledWith(
        'evt_unknown', 'skipped', 'Unhandled event type: unknown.event.type'
      );
    });

    it('retries a previously failed event', async () => {
      mockConstructWebhookEvent.mockReturnValue(
        makePaymentIntentEvent('evt_retry', 'payment_intent.succeeded')
      );
      mockClaimWebhookEvent.mockResolvedValue('retry');

      const req = createMockRequest(JSON.stringify({}), 'valid_sig');
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockHandlePaymentIntentSucceeded).toHaveBeenCalled();
    });
  });
});
