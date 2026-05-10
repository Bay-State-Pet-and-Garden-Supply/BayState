/**
 * @jest-environment node
 */

import { POST } from '@/app/api/orders/[id]/payment-complete/route';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockGetStripeServerClient = jest.fn();
const mockRetrievePaymentIntent = jest.fn();
const mockCreateAdminClient = jest.fn();
const mockReconcileFromBrowser = jest.fn();
const mockSingle = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();

jest.mock('@/lib/payments/stripe', () => ({
  getStripeServerClient: (...args: unknown[]) => mockGetStripeServerClient(...args),
  retrievePaymentIntent: (...args: unknown[]) => mockRetrievePaymentIntent(...args),
}));

jest.mock('@/lib/payments/order-payment-reconciliation', () => ({
  reconcileFromBrowser: (...args: unknown[]) => mockReconcileFromBrowser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ORDER_ID = '00000000-0000-0000-0000-000000000001';
const VALID_PI_ID = 'pi_test_complete_001';

function createMockRequest(body: unknown): NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

function mockSupabaseOrder(overrides: Record<string, unknown> = {}) {
  const defaultOrder = {
    id: VALID_ORDER_ID,
    order_number: 'BSP-20260510-0001',
    total: 79.99,
    payment_status: 'unpaid',
    stripe_payment_intent_id: null,
    customer_email: 'test@example.local',
  };

  mockSingle.mockResolvedValue({
    data: { ...defaultOrder, ...overrides },
    error: null,
  });

  mockEq.mockReturnValue({ single: mockSingle });
  mockSelect.mockReturnValue({ eq: mockEq });

  mockCreateAdminClient.mockReturnValue({
    from: () => ({
      select: mockSelect,
      update: jest.fn().mockResolvedValue({ error: null }),
    }),
  });
}

function mockValidPaymentIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_PI_ID,
    status: 'succeeded',
    amount: 7999,
    amount_received: 7999,
    currency: 'usd',
    latest_charge: 'ch_test_complete',
    metadata: {
      order_id: VALID_ORDER_ID,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/orders/[id]/payment-complete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStripeServerClient.mockReturnValue({});
    mockRetrievePaymentIntent.mockResolvedValue(mockValidPaymentIntent());
    mockSupabaseOrder();
    mockReconcileFromBrowser.mockResolvedValue({
      updated: true,
      orderId: VALID_ORDER_ID,
      previousStatus: 'unpaid',
      newStatus: 'paid',
      eventId: `browser:${VALID_PI_ID}`,
    });
  });

  it('returns 400 for empty body', async () => {
    const req = createMockRequest({});
    const res = await POST(req, { params: Promise.resolve({ id: VALID_ORDER_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid request');
  });

  it('returns 400 for missing paymentIntentId', async () => {
    const req = createMockRequest({ notTheRightField: 'pi_123' });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_ORDER_ID }) });
    expect(res.status).toBe(400);
  });

  it('returns 500 when Stripe is not configured', async () => {
    mockGetStripeServerClient.mockImplementation(() => {
      throw new Error('STRIPE_SECRET_KEY not set');
    });

    const req = createMockRequest({ paymentIntentId: VALID_PI_ID });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_ORDER_ID }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('not configured');
  });

  it('returns 404 when order not found', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });
    mockEq.mockReturnValue({ single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockCreateAdminClient.mockReturnValue({
      from: () => ({ select: mockSelect, update: jest.fn() }),
    });

    const req = createMockRequest({ paymentIntentId: VALID_PI_ID });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_ORDER_ID }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 when PaymentIntent metadata.order_id does not match', async () => {
    mockRetrievePaymentIntent.mockResolvedValue(
      mockValidPaymentIntent({ metadata: { order_id: 'wrong-order-id' } })
    );

    const req = createMockRequest({ paymentIntentId: VALID_PI_ID });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_ORDER_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('order_id mismatch');
  });

  it('returns 400 when PaymentIntent has not succeeded', async () => {
    mockRetrievePaymentIntent.mockResolvedValue(
      mockValidPaymentIntent({ status: 'requires_payment_method' })
    );

    const req = createMockRequest({ paymentIntentId: VALID_PI_ID });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_ORDER_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('requires_payment_method');
  });

  it('returns 400 when PaymentIntent amount does not match order total', async () => {
    mockRetrievePaymentIntent.mockResolvedValue(
      mockValidPaymentIntent({ amount: 5000, amount_received: 5000 })
    );

    const req = createMockRequest({ paymentIntentId: VALID_PI_ID });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_ORDER_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('amount does not match');
  });

  it('reconciles successfully when all verifications pass', async () => {
    const req = createMockRequest({ paymentIntentId: VALID_PI_ID });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_ORDER_ID }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.paymentStatus).toBe('paid');
    expect(body.updated).toBe(true);

    // Verify reconciliation was called
    expect(mockReconcileFromBrowser).toHaveBeenCalledWith(
      VALID_ORDER_ID,
      expect.objectContaining({ id: VALID_PI_ID, status: 'succeeded' }),
      `browser:${VALID_PI_ID}`
    );
  });

  it('handles already-reconciled order (idempotent)', async () => {
    mockReconcileFromBrowser.mockResolvedValue({
      updated: false,
      orderId: VALID_ORDER_ID,
      previousStatus: 'paid',
      newStatus: 'paid',
      eventId: `browser:${VALID_PI_ID}`,
    });

    mockSupabaseOrder({ payment_status: 'paid', stripe_payment_intent_id: VALID_PI_ID });

    const req = createMockRequest({ paymentIntentId: VALID_PI_ID });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_ORDER_ID }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.updated).toBe(false);
    expect(body.paymentStatus).toBe('paid');
  });
});
