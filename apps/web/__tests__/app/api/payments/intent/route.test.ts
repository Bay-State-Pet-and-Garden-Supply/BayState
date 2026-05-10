/**
 * @jest-environment node
 */

import { POST } from '@/app/api/payments/intent/route';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockGetStripeServerClient = jest.fn();
const mockRetrievePaymentIntent = jest.fn();
const mockCreatePaymentIntent = jest.fn();
const mockCancelPaymentIntent = jest.fn();
const mockCreateAdminClient = jest.fn();
const mockSingle = jest.fn();
const mockSelect = jest.fn();
const mockSelectEq = jest.fn(); // for select queries: .eq('id', ...)
const mockUpdate = jest.fn();    // for update queries
const mockUpdateEq = jest.fn();  // for update chain: .eq('id', ...)

jest.mock('@/lib/payments/stripe', () => ({
  getStripeServerClient: (...args: unknown[]) => mockGetStripeServerClient(...args),
  retrievePaymentIntent: (...args: unknown[]) => mockRetrievePaymentIntent(...args),
  createPaymentIntent: (...args: unknown[]) => mockCreatePaymentIntent(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(body: unknown): NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

/** Sets up the Supabase mock chain for the route handler:
 *  from('orders').select('*').eq('id', orderId).single()
 *  from('orders').update({...}).eq('id', orderId)
 */
function mockSupabaseOrder(overrides: Record<string, unknown> = {}) {
  const defaultOrder = {
    id: '11111111-1111-4111-8111-111111111111',
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

  mockSelectEq.mockReturnValue({ single: mockSingle });
  mockSelect.mockReturnValue({ eq: mockSelectEq });

  mockUpdateEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockUpdateEq });

  mockCreateAdminClient.mockReturnValue({
    from: () => ({
      select: mockSelect,
      update: mockUpdate,
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/payments/intent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStripeServerClient.mockReturnValue({
      paymentIntents: {
        create: mockCreatePaymentIntent,
        retrieve: mockRetrievePaymentIntent,
        cancel: mockCancelPaymentIntent,
      },
    });
    mockSupabaseOrder();
  });

  it('returns 400 for empty body', async () => {
    const req = createMockRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid request');
  });

  it('returns 400 for invalid orderId', async () => {
    const req = createMockRequest({ orderId: 'not-a-uuid' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 500 when Stripe is not configured', async () => {
    mockGetStripeServerClient.mockImplementation(() => {
      throw new Error('STRIPE_SECRET_KEY not set');
    });

    const req = createMockRequest({ orderId: '11111111-1111-4111-8111-111111111111' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('not configured');
  });

  it('returns 404 when order not found', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

    const req = createMockRequest({ orderId: '55555555-5555-4555-8555-555555555599' });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('returns 409 when order is already paid', async () => {
    mockSupabaseOrder({ payment_status: 'paid' });
    const req = createMockRequest({ orderId: '11111111-1111-4111-8111-111111111111' });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('already paid');
  });

  it('returns 409 when order is refunded', async () => {
    mockSupabaseOrder({ payment_status: 'refunded' });
    const req = createMockRequest({ orderId: '11111111-1111-4111-8111-111111111111' });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it('returns 409 when order is voided', async () => {
    mockSupabaseOrder({ payment_status: 'voided' });
    const req = createMockRequest({ orderId: '11111111-1111-4111-8111-111111111111' });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it('creates a new PaymentIntent with server-derived amount', async () => {
    mockSupabaseOrder({ total: 79.99, stripe_payment_intent_id: null });

    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_test_new_001',
      client_secret: 'pi_test_new_001_secret_test',
      amount: 7999,
      currency: 'usd',
      status: 'requires_payment_method',
    });

    const req = createMockRequest({ orderId: '11111111-1111-4111-8111-111111111111' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.paymentIntentId).toBe('pi_test_new_001');
    expect(body.amount).toBe(7999);
    expect(body.clientSecret).toBeTruthy();

    // Verify Stripe was called with server-derived amount (79.99 -> 7999 cents)
    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 7999,
        currency: 'usd',
      }),
      expect.objectContaining({
        idempotencyKey: 'order:11111111-1111-4111-8111-111111111111:7999',
      })
    );

    // Verify PI ID was stored on order
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_payment_intent_id: 'pi_test_new_001' })
    );
  });

  it('reuses an existing active PaymentIntent when amount matches', async () => {
    mockSupabaseOrder({
      total: 79.99,
      stripe_payment_intent_id: 'pi_existing_active',
    });

    mockRetrievePaymentIntent.mockResolvedValue({
      id: 'pi_existing_active',
      client_secret: 'pi_existing_active_secret',
      amount: 7999,
      currency: 'usd',
      status: 'requires_payment_method',
    });

    const req = createMockRequest({ orderId: '11111111-1111-4111-8111-111111111111' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.paymentIntentId).toBe('pi_existing_active');

    // Should NOT create a new PI
    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it('cancels and recreates PI when amount changes', async () => {
    mockSupabaseOrder({
      total: 89.99, // Changed from original
      stripe_payment_intent_id: 'pi_old_amount',
    });

    mockRetrievePaymentIntent.mockResolvedValue({
      id: 'pi_old_amount',
      client_secret: 'secret_old',
      amount: 7999, // Old amount (79.99)
      currency: 'usd',
      status: 'requires_payment_method',
    });

    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_new_amount',
      client_secret: 'secret_new',
      amount: 8999,
      currency: 'usd',
    });

    const req = createMockRequest({ orderId: '11111111-1111-4111-8111-111111111111' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.paymentIntentId).toBe('pi_new_amount');

    // Old PI should have been canceled
    expect(mockCancelPaymentIntent).toHaveBeenCalledWith('pi_old_amount');
    // New PI created
    expect(mockCreatePaymentIntent).toHaveBeenCalled();
  });
});
