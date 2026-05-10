/**
 * @jest-environment node
 */

import {
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed,
  handlePaymentIntentCanceled,
  handleChargeRefunded,
  reconcileFromBrowser,
} from '@/lib/payments/order-payment-reconciliation';

// ---------------------------------------------------------------------------
// Mock Supabase - variable IS declared before jest.mock, hoisting is fine
// because the factory function is evaluated lazily when the module loads,
// after all module-scope code has run.
// ---------------------------------------------------------------------------

// Hoisting-safe pattern: declare vars at module scope, use arrow functions in the
// jest.mock factory to defer access until the mock is actually called.
let mockCreateAdminClientImpl: jest.Mock;
let mockSingle: jest.Mock;
let mockSelect: jest.Mock;
let mockEq: jest.Mock;
let mockInsert: jest.Mock;
let mockUpdate: jest.Mock;
let mockUpdateEq: jest.Mock;
let mockFrom: jest.Mock;

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClientImpl(...args),
}));

function setupMocks() {
  mockCreateAdminClientImpl = jest.fn();
  mockSingle = jest.fn();
  mockSelect = jest.fn();
  mockEq = jest.fn();
  mockInsert = jest.fn();
  mockUpdate = jest.fn();
  mockUpdateEq = jest.fn();
  mockFrom = jest.fn();

  mockCreateAdminClientImpl.mockResolvedValue({
    from: mockFrom,
  });
}

function mockOrderQuery(result: Record<string, unknown> | null) {
  mockSingle.mockResolvedValue({ data: result, error: result ? null : { message: 'Not found' } });
  mockEq.mockReturnValue({ single: mockSingle, order: mockEq });
  mockSelect.mockReturnValue({ eq: mockEq, order: mockEq });
  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    eq: mockEq,
    order: mockEq,
  });

  // .update() returns an object with .eq()
  mockUpdate.mockReturnValue({ eq: mockUpdateEq });
  mockUpdateEq.mockResolvedValue({ error: null });

  // .insert() returns a resolved promise directly
  mockInsert.mockResolvedValue({ error: null, data: null });
}

function mockInsertResult(error: { code?: string } | null = null) {
  mockInsert.mockResolvedValue({ error: error || null, data: null });
}

const TEST_ORDER_ID = '11111111-1111-4111-8111-111111111111';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('order-payment-reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
    mockOrderQuery({
      id: TEST_ORDER_ID,
      total: 79.99,
      payment_status: 'unpaid',
      refunded_amount: 0,
    });
    mockInsertResult();
  });

  // -----------------------------------------------------------------------
  // handlePaymentIntentSucceeded
  // -----------------------------------------------------------------------

  describe('handlePaymentIntentSucceeded', () => {
    it('updates order to paid and records payment', async () => {
      const result = await handlePaymentIntentSucceeded(
        {
          id: 'pi_success_1',
          amount: 7999,
          amount_received: 7999,
          currency: 'usd',
          latest_charge: 'ch_success_1',
          status: 'succeeded',
          metadata: { order_id: TEST_ORDER_ID },
          last_payment_error: null,
        } as never,
        'evt_success_1'
      );

      expect(result.updated).toBe(true);
      expect(result.newStatus).toBe('paid');
      expect(result.orderId).toBe(TEST_ORDER_ID);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ payment_status: 'paid' })
      );

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ stripe_event_id: 'evt_success_1' })
      );
    });

    it('skips when order has no order_id metadata', async () => {
      const result = await handlePaymentIntentSucceeded(
        {
          id: 'pi_no_meta',
          amount: 7999,
          amount_received: 7999,
          currency: 'usd',
          metadata: {},
        } as never,
        'evt_no_meta'
      );

      expect(result.updated).toBe(false);
      expect(result.orderId).toBe('unknown');
    });

    it('does not downgrade when already paid', async () => {
      mockOrderQuery({
        id: TEST_ORDER_ID,
        total: 79.99,
        payment_status: 'paid',
        refunded_amount: 0,
      });

      const result = await handlePaymentIntentSucceeded(
        {
          id: 'pi_dup',
          amount: 7999,
          amount_received: 7999,
          currency: 'usd',
          latest_charge: 'ch_dup',
          status: 'succeeded',
          metadata: { order_id: TEST_ORDER_ID },
          last_payment_error: null,
        } as never,
        'evt_dup'
      );

      // Still performs DB update (re-stamps paid_at, stripe_payment_intent_id)
      expect(result.updated).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // handlePaymentIntentFailed
  // -----------------------------------------------------------------------

  describe('handlePaymentIntentFailed', () => {
    it('updates order to failed when unpaid', async () => {
      const result = await handlePaymentIntentFailed(
        {
          id: 'pi_fail_1',
          metadata: { order_id: TEST_ORDER_ID },
          last_payment_error: { message: 'Card declined' },
        } as never,
        'evt_fail_1'
      );

      expect(result.updated).toBe(true);
      expect(result.newStatus).toBe('failed');
    });

    it('does not downgrade a paid order to failed', async () => {
      mockOrderQuery({
        id: TEST_ORDER_ID,
        total: 79.99,
        payment_status: 'paid',
        refunded_amount: 0,
      });

      const result = await handlePaymentIntentFailed(
        {
          id: 'pi_fail_paid',
          metadata: { order_id: TEST_ORDER_ID },
          last_payment_error: { message: 'Failed after success' },
        } as never,
        'evt_fail_paid'
      );

      expect(result.updated).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // handlePaymentIntentCanceled
  // -----------------------------------------------------------------------

  describe('handlePaymentIntentCanceled', () => {
    it('updates order to voided', async () => {
      const result = await handlePaymentIntentCanceled(
        {
          id: 'pi_cancel_1',
          metadata: { order_id: TEST_ORDER_ID },
        } as never,
        'evt_cancel_1'
      );

      expect(result.updated).toBe(true);
      expect(result.newStatus).toBe('voided');
    });
  });

  // -----------------------------------------------------------------------
  // handleChargeRefunded
  // -----------------------------------------------------------------------

  describe('handleChargeRefunded', () => {
    it('updates order to refunded when fully refunded', async () => {
      mockOrderQuery({
        id: TEST_ORDER_ID,
        total: 79.99,
        payment_status: 'paid',
        stripe_payment_intent_id: 'pi_refund_1',
        refunded_amount: 0,
      });

      const result = await handleChargeRefunded(
        {
          id: 'ch_refund_1',
          payment_intent: 'pi_refund_1',
          amount_refunded: 7999,
          currency: 'usd',
        } as never,
        'evt_refund_1'
      );

      expect(result.updated).toBe(true);
      expect(result.newStatus).toBe('refunded');
    });

    it('updates order to partially_refunded', async () => {
      mockOrderQuery({
        id: TEST_ORDER_ID,
        total: 79.99,
        payment_status: 'paid',
        stripe_payment_intent_id: 'pi_partial',
        refunded_amount: 20.00,
      });

      const result = await handleChargeRefunded(
        {
          id: 'ch_partial',
          payment_intent: 'pi_partial',
          amount_refunded: 1000,
          currency: 'usd',
        } as never,
        'evt_partial'
      );

      expect(result.updated).toBe(true);
      expect(result.newStatus).toBe('partially_refunded');
    });
  });

  // -----------------------------------------------------------------------
  // reconcileFromBrowser
  // -----------------------------------------------------------------------

  describe('reconcileFromBrowser', () => {
    it('updates order when PaymentIntent is valid', async () => {
      const result = await reconcileFromBrowser(
        TEST_ORDER_ID,
        {
          id: 'pi_browser_1',
          status: 'succeeded',
          amount: 7999,
          amount_received: 7999,
          currency: 'usd',
          latest_charge: 'ch_browser_1',
          metadata: { order_id: TEST_ORDER_ID },
          last_payment_error: null,
        } as never,
        'browser:pi_browser_1'
      );

      expect(result.updated).toBe(true);
      expect(result.newStatus).toBe('paid');
    });

    it('throws if metadata.order_id does not match', async () => {
      await expect(
        reconcileFromBrowser(
          TEST_ORDER_ID,
          {
            id: 'pi_wrong',
            status: 'succeeded',
            amount: 7999,
            amount_received: 7999,
            metadata: { order_id: 'wrong-order' },
          } as never,
          'browser:pi_wrong'
        )
      ).rejects.toThrow('does not match');
    });

    it('throws if PaymentIntent has not succeeded', async () => {
      await expect(
        reconcileFromBrowser(
          TEST_ORDER_ID,
          {
            id: 'pi_failed',
            status: 'requires_payment_method',
            amount: 7999,
            amount_received: 0,
            metadata: { order_id: TEST_ORDER_ID },
          } as never,
          'browser:pi_failed'
        )
      ).rejects.toThrow('requires_payment_method');
    });
  });
});
