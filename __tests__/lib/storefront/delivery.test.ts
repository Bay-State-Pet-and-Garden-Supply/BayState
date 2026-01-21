import { calculateDeliveryFee, formatDeliveryFee } from '@/lib/storefront/delivery';
import type { DeliveryFeeBreakdown } from '@/lib/storefront/delivery';

// Re-create the config for testing since it's not exported
const TEST_DELIVERY_CONFIG = {
  baseFee: 25,
  perMileRate: 1.50,
  freeRadiusMiles: 15,
  maxDeliveryMiles: 75,
  serviceFees: {
    pallet_jack: 25,
    lift_gate: 50,
    forklift: 75,
    garage_placement: 25,
  },
};

describe('Delivery Fee Calculation', () => {
  describe('calculateDeliveryFee', () => {
    it('returns zero for distance within free radius', () => {
      const result = calculateDeliveryFee(10, [], TEST_DELIVERY_CONFIG);
      expect(result.distanceMiles).toBe(10);
      expect(result.distanceFee).toBe(0);
      expect(result.serviceFees).toBe(0);
      expect(result.total).toBe(0);
      expect(result.isOutOfRange).toBe(false);
    });

    it('calculates base fee for distance at free radius boundary', () => {
      // At exactly 15 miles, fee is still 0 (only > 15 miles is billable)
      const result = calculateDeliveryFee(15, [], TEST_DELIVERY_CONFIG);
      expect(result.distanceMiles).toBe(15);
      expect(result.distanceFee).toBe(0); // 15 is not > 15
      expect(result.total).toBe(0);
      expect(result.isOutOfRange).toBe(false);
    });

    it('calculates fee with per-mile rate beyond free radius', () => {
      // 20 miles = 15 free + 5 billable
      // Fee = $25 base + ($1.50 * 5) = $25 + $7.50 = $32.50
      const result = calculateDeliveryFee(20, [], TEST_DELIVERY_CONFIG);
      expect(result.distanceMiles).toBe(20);
      expect(result.distanceFee).toBe(32.50);
      expect(result.total).toBe(32.50);
      expect(result.isOutOfRange).toBe(false);
    });

    it('handles longer distances correctly', () => {
      // 30 miles = 15 free + 15 billable
      // Fee = $25 base + ($1.50 * 15) = $25 + $22.50 = $47.50
      const result = calculateDeliveryFee(30, [], TEST_DELIVERY_CONFIG);
      expect(result.distanceMiles).toBe(30);
      expect(result.distanceFee).toBe(47.50);
      expect(result.total).toBe(47.50);
    });

    it('returns out of range for distances beyond max', () => {
      const result = calculateDeliveryFee(100, [], TEST_DELIVERY_CONFIG);
      expect(result.distanceMiles).toBe(100);
      expect(result.distanceFee).toBe(0);
      expect(result.serviceFees).toBe(0);
      expect(result.total).toBe(0);
      expect(result.isOutOfRange).toBe(true);
      expect(result.outOfRangeMessage).toContain('75');
    });

    it('adds service fees correctly', () => {
      const result = calculateDeliveryFee(20, ['pallet_jack', 'lift_gate'], TEST_DELIVERY_CONFIG);
      expect(result.distanceFee).toBe(32.50);
      expect(result.serviceFees).toBe(75); // $25 + $50
      expect(result.total).toBe(107.50); // 32.50 + 75
    });

    it('handles single service', () => {
      const result = calculateDeliveryFee(10, ['garage_placement'], TEST_DELIVERY_CONFIG);
      expect(result.distanceFee).toBe(0);
      expect(result.serviceFees).toBe(25);
      expect(result.total).toBe(25);
    });

    it('handles forklift service', () => {
      const result = calculateDeliveryFee(20, ['forklift'], TEST_DELIVERY_CONFIG);
      expect(result.serviceFees).toBe(75);
      expect(result.total).toBe(107.50);
    });

    it('rounds values to 2 decimal places', () => {
      const result = calculateDeliveryFee(17, [], TEST_DELIVERY_CONFIG); // 2 billable miles
      expect(result.distanceMiles).toBe(17);
      expect(result.distanceFee).toBe(28); // $25 + ($1.50 * 2)
      expect(result.total).toBe(28);
    });

    it('handles empty services array', () => {
      const result = calculateDeliveryFee(25, [], TEST_DELIVERY_CONFIG);
      expect(result.serviceFees).toBe(0);
    });
  });

  describe('formatDeliveryFee', () => {
    it('returns FREE for zero total within radius', () => {
      const breakdown: DeliveryFeeBreakdown = {
        subtotal: 0,
        distanceMiles: 10,
        distanceFee: 0,
        serviceFees: 0,
        total: 0,
        isOutOfRange: false,
      };
      expect(formatDeliveryFee(breakdown)).toBe('FREE');
    });

    it('formats fee with dollar sign prefix', () => {
      const breakdown: DeliveryFeeBreakdown = {
        subtotal: 32.50,
        distanceMiles: 20,
        distanceFee: 32.50,
        serviceFees: 0,
        total: 32.50,
        isOutOfRange: false,
      };
      expect(formatDeliveryFee(breakdown)).toBe('$32.50');
    });

    it('shows out of range message', () => {
      const breakdown: DeliveryFeeBreakdown = {
        subtotal: 0,
        distanceMiles: 100,
        distanceFee: 0,
        serviceFees: 0,
        total: 0,
        isOutOfRange: true,
        outOfRangeMessage: 'We only deliver within 75 miles.',
      };
      expect(formatDeliveryFee(breakdown)).toBe('We only deliver within 75 miles.');
    });

    it('handles missing outOfRangeMessage', () => {
      const breakdown: DeliveryFeeBreakdown = {
        subtotal: 0,
        distanceMiles: 100,
        distanceFee: 0,
        serviceFees: 0,
        total: 0,
        isOutOfRange: true,
      };
      expect(formatDeliveryFee(breakdown)).toBe('Delivery not available');
    });
  });
});
