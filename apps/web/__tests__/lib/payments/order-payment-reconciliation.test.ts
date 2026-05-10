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
// Mock Supabase admin client
// ---------------------------------------------------------------------------

const mockSupabaseFrom = jest.fn();
const mockSingle = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockOrder = jest.fn();
const mockThen = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn().mockResolvedValue({
    from: mockSupabaseFrom,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockOrderQuery(result: Record<string, unknown> | null) {
  mockSingle.mockResolvedValue({ data: result, error: result ? null : { message: 'Not found' } });
  mockEq.mockReturnValue({ single: mockSingle, order: mockOrder, then: mockThen });
  mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder, then: mockThen });
  mockSupabaseFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    eq: mockEq,
    order: mockOrder,
    then: mockThen,
  });
}

function mockInsertResult(error: { code?: string } | null = null) {
  mockInsert.mockResolvedValue({ error: error || null, data: null });
}

function mockUpdateResult(error: object | null = null) {
  mockUpdate.mockResolvedValue({ error, data: null });
}

const TEST_ORDER_ID = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('order-payment-reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderQuery({
      id: TEST_ORDER_ID,
      total: 79.99,
      payment_status: 'unpaid',
      refunded_amount: 0,
    });
    mockInsertResult();
    mockUpdateResult();
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

      // Should update order payment_status
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_status: 'paid',
        })
      );

      // Should record payment
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          stripe_event_id: 'evt_success_1',
        })
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

    it('does not downgrade from paid to a lower status', async () => {
      // Order is already paid
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

      // Should be treated as skip since status didn't change
      expect(result.newStatus).toBe('paid');
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

      // Should NOT downgrade from paid to failed
      expect(result.updated).toBe(false);
      expect(result.newStatus).toBe('failed');
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

    it('updates order to partially_refunded when only partially refunded', async () => {
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
          amount_refunded: 1000, // $10 more
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
      ).rejects.toThrow('order_id mismatch');
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
