import { verifyCart } from '@/lib/pricing/verify-cart';
import type { SupabaseClient } from '@supabase/supabase-js';

function createMockClient(data: Record<string, any>): SupabaseClient {
  const from = (table: string) => ({
    select: (_cols?: string) => ({
      in: (_col: string, _vals: string[]) => {
        const items = data[table] || [];
        return Promise.resolve({ data: items, error: null });
      },
    }),
  });
  return { from } as unknown as SupabaseClient;
}

describe('verifyCart', () => {
  const validProducts = [
    { id: 'p1', name: 'Product 1', slug: 'product-1', price: 10.99, images: ['/img1.jpg'], stock_status: 'in_stock' },
    { id: 'p2', name: 'Product 2', slug: 'product-2', price: 25.00, images: [], stock_status: 'in_stock' },
  ];
  const validServices = [
    { id: 's1', name: 'Service 1', slug: 'service-1', price: 15.00, is_active: true },
  ];

  it('computes totals from DB product prices', async () => {
    const client = createMockClient({ products: validProducts, services: [] });
    const result = await verifyCart(
      client,
      [{ id: 'p1', quantity: 2 }, { id: 'p2', quantity: 1 }],
      null, 'pickup', null
    );

    expect(result.subtotal).toBe(46.98); // 10.99*2 + 25.00
    expect(result.items).toHaveLength(2);
    expect(result.items[0].unitPrice).toBe(10.99);
    expect(result.items[0].totalPrice).toBe(21.98);
    expect(result.items[1].unitPrice).toBe(25.00);
    expect(result.items[1].totalPrice).toBe(25.00);
    expect(result.deliveryFee).toBe(0); // pickup
  });

  it('rejects missing products', async () => {
    const client = createMockClient({ products: validProducts, services: [] });
    await expect(
      verifyCart(client, [{ id: 'nonexistent', quantity: 1 }], null, 'pickup', null)
    ).rejects.toThrow('Product not found');
  });

  it('handles service items with service- prefix', async () => {
    const client = createMockClient({ products: [], services: validServices });
    const result = await verifyCart(
      client,
      [{ id: 'service-s1', quantity: 1 }],
      null, 'pickup', null
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].itemType).toBe('service');
    expect(result.items[0].unitPrice).toBe(15.00);
    expect(result.subtotal).toBe(15.00);
  });

  it('rejects missing services', async () => {
    const client = createMockClient({ products: [], services: [] });
    await expect(
      verifyCart(client, [{ id: 'service-nonexistent', quantity: 1 }], null, 'pickup', null)
    ).rejects.toThrow('Service not found');
  });

  it('sets delivery fee to 0 for pickup', async () => {
    const client = createMockClient({ products: validProducts, services: [] });
    const result = await verifyCart(
      client,
      [{ id: 'p1', quantity: 1 }],
      null, 'pickup', null
    );
    expect(result.deliveryFee).toBe(0);
  });

  it('uses provided delivery fee for delivery', async () => {
    const client = createMockClient({ products: validProducts, services: [] });
    const result = await verifyCart(
      client,
      [{ id: 'p1', quantity: 1 }],
      null, 'delivery', 5.99
    );
    expect(result.deliveryFee).toBe(5.99);
  });

  it('computes tax correctly', async () => {
    const client = createMockClient({ products: validProducts, services: [] });
    const result = await verifyCart(
      client,
      [{ id: 'p1', quantity: 1 }], // subtotal = 10.99
      null, 'pickup', null
    );
    expect(result.tax).toBeCloseTo(0.69, 1); // 10.99 * 0.0625 ≈ 0.69
  });

  it('computes total correctly', async () => {
    const client = createMockClient({ products: validProducts, services: [] });
    const result = await verifyCart(
      client,
      [{ id: 'p1', quantity: 1, }, { id: 'p2', quantity: 1 }], // subtotal = 35.99
      null, 'delivery', 5.99
    );
    // 35.99 - 0 + 5.99 + (35.99 * 0.0625 ≈ 2.25) = 44.23
    expect(result.total).toBeCloseTo(44.23, 1);
  });
});
