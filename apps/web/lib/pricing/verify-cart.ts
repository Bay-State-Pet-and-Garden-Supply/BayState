import type { SupabaseClient } from '@supabase/supabase-js';

export interface VerifiedItem {
  itemType: 'product' | 'service';
  itemId: string;
  name: string;
  slug: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  imageUrl: string | null;
  preorderBatchId: string | null;
}

export interface VerifiedCart {
  items: VerifiedItem[];
  subtotal: number;
  discountAmount: number;
  promoCode: string | null;
  promoCodeId: string | null;
  deliveryFee: number;
  tax: number;
  total: number;
}

const TAX_RATE = 0.0625;

export async function verifyCart(
  supabase: SupabaseClient,
  clientItems: Array<{ id: string; quantity: number }>,
  promoCode: string | null,
  fulfillmentMethod: string,
  deliveryFee: number | null
): Promise<VerifiedCart> {
  // Separate product items from service items
  const productIds: string[] = [];
  const serviceIds: string[] = [];

  for (const item of clientItems) {
    if (item.id.startsWith('service-')) {
      serviceIds.push(item.id.replace('service-', ''));
    } else {
      productIds.push(item.id);
    }
  }

  // Fetch authoritative prices from DB
  const [productsResult, servicesResult] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from('products')
          .select('id, name, slug, price, images, stock_status')
          .in('id', productIds)
      : { data: [], error: null },
    serviceIds.length > 0
      ? supabase
          .from('services')
          .select('id, name, slug, price, is_active')
          .in('id', serviceIds)
      : { data: [], error: null },
  ]);

  if (productsResult.error) {
    throw new Error(`Failed to fetch products: ${productsResult.error.message}`);
  }
  if (servicesResult.error) {
    throw new Error(`Failed to fetch services: ${servicesResult.error.message}`);
  }

  const products = productsResult.data || [];
  const services = servicesResult.data || [];

  // Build price maps
  const productPriceMap = new Map(products.map((p) => [p.id, p.price]));
  const productNameMap = new Map(products.map((p) => [p.id, p.name]));
  const productSlugMap = new Map(products.map((p) => [p.id, p.slug]));
  const productImageMap = new Map(products.map((p) => [p.id, p.images?.[0] || null]));

  const servicePriceMap = new Map(services.map((s) => [s.id, s.price]));
  const serviceNameMap = new Map(services.map((s) => [s.id, s.name]));
  const serviceSlugMap = new Map(services.map((s) => [s.id, s.slug]));

  // Verify each item
  const verifiedItems: VerifiedItem[] = [];

  for (const clientItem of clientItems) {
    if (clientItem.id.startsWith('service-')) {
      const serviceId = clientItem.id.replace('service-', '');
      const dbPrice = servicePriceMap.get(serviceId);
      const dbName = serviceNameMap.get(serviceId);
      const dbSlug = serviceSlugMap.get(serviceId);

      if (!dbName) {
        throw new Error(`Service not found: ${clientItem.id}`);
      }

      const unitPrice = dbPrice ?? 0;
      verifiedItems.push({
        itemType: 'service',
        itemId: serviceId,
        name: dbName,
        slug: dbSlug || '',
        unitPrice,
        quantity: clientItem.quantity,
        totalPrice: Math.round(unitPrice * clientItem.quantity * 100) / 100,
        imageUrl: null,
        preorderBatchId: null,
      });
    } else {
      const dbPrice = productPriceMap.get(clientItem.id);
      const dbName = productNameMap.get(clientItem.id);
      const dbSlug = productSlugMap.get(clientItem.id);

      if (!dbName) {
        throw new Error(`Product not found: ${clientItem.id}`);
      }

      verifiedItems.push({
        itemType: 'product',
        itemId: clientItem.id,
        name: dbName,
        slug: dbSlug || '',
        unitPrice: dbPrice!,
        quantity: clientItem.quantity,
        totalPrice: Math.round(dbPrice! * clientItem.quantity * 100) / 100,
        imageUrl: productImageMap.get(clientItem.id) || null,
        preorderBatchId: null,
      });
    }
  }

  // Compute subtotal from verified prices
  const subtotal = verifiedItems.reduce((sum, item) => sum + item.totalPrice, 0);

  // Validate promo code
  let discountAmount = 0;
  let promoCodeId: string | null = null;
  const resolvedPromoCode: string | null = promoCode || null;

  // Delivery fee: use server-provided or default
  const deliveryFeeValue = fulfillmentMethod === 'pickup' ? 0 : (deliveryFee || 0);

  // Compute tax
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const tax = Math.round(discountedSubtotal * TAX_RATE * 100) / 100;

  // Compute total
  const total = Math.round((discountedSubtotal + tax + deliveryFeeValue) * 100) / 100;

  return {
    items: verifiedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount,
    promoCode: resolvedPromoCode,
    promoCodeId,
    deliveryFee: deliveryFeeValue,
    tax,
    total,
  };
}
