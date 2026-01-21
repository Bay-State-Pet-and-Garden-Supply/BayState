import { createClient } from '@/lib/supabase/server';
import { type CartItem } from '@/lib/cart-store';
import { recordPromoRedemption } from '@/lib/promo-codes';

export interface OrderItem {
  id: string;
  order_id: string;
  item_type: 'product' | 'service';
  item_id: string;
  item_name: string;
  item_slug: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export type PaymentMethod = 'pickup' | 'credit_card' | 'paypal';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'partially_refunded';

export interface Order {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  discount_amount: number;
  promo_code: string | null;
  promo_code_id: string | null;
  tax: number;
  total: number;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  paid_at: string | null;
  refunded_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  payment_method: 'credit_card' | 'paypal';
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  items: CartItem[];
  promoCode?: string | null;
  promoCodeId?: string | null;
  discountAmount?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  stripePaymentIntentId?: string;
  stripeCustomerId?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<Order | null> {
  const supabase = await createClient();

  const subtotal = input.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const discountAmount = input.discountAmount || 0;
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const tax = discountedSubtotal * 0.0625;
  const total = discountedSubtotal + tax;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone || null,
      notes: input.notes || null,
      subtotal,
      discount_amount: discountAmount,
      promo_code: input.promoCode || null,
      promo_code_id: input.promoCodeId || null,
      tax,
      total,
      payment_method: input.paymentMethod || 'pickup',
      payment_status: input.paymentStatus || 'pending',
      stripe_payment_intent_id: input.stripePaymentIntentId || null,
      stripe_customer_id: input.stripeCustomerId || null,
      refunded_amount: 0,
      paid_at: null,
    })
    .select()
    .single();

  if (orderError || !order) {
    console.error('Error creating order:', orderError);
    return null;
  }

  const orderItems = input.items.map((item) => ({
    order_id: order.id,
    item_type: item.id.startsWith('service-') ? 'service' : 'product',
    item_id: item.id.replace('service-', ''),
    item_name: item.name,
    item_slug: item.slug,
    quantity: item.quantity,
    unit_price: item.price,
    total_price: item.price * item.quantity,
  }));

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems);

  if (itemsError) {
    console.error('Error creating order items:', itemsError);
  }

  if (input.promoCodeId && discountAmount > 0) {
    await recordPromoRedemption({
      promoCodeId: input.promoCodeId,
      orderId: order.id,
      userId: order.user_id,
      guestEmail: input.customerEmail,
      discountApplied: discountAmount,
    });
  }

  return order as Order;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching order:', error);
    return null;
  }

  return data as Order;
}

export async function getOrderByNumber(orderNumber: string): Promise<Order | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('order_number', orderNumber)
    .single();

  if (error) {
    console.error('Error fetching order:', error);
    return null;
  }

  return data as Order;
}

export async function getOrders(options?: {
  status?: string;
  userId?: string;
  customerEmail?: string;
  limit?: number;
  offset?: number;
}): Promise<{ orders: Order[]; count: number }> {
  const supabase = await createClient();
  let query = supabase
    .from('orders')
    .select('*', { count: 'exact' });

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.userId) {
    query = query.eq('user_id', options.userId);
  }

  if (options?.customerEmail) {
    query = query.eq('customer_email', options.customerEmail);
  }

  query = query.order('created_at', { ascending: false });

  if (options?.limit) {
    const offset = options.offset || 0;
    query = query.range(offset, offset + options.limit - 1);
  } else {
    query = query.limit(500);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching orders:', error);
    return { orders: [], count: 0 };
  }

  return { orders: data as Order[] || [], count: count || 0 };
}

export async function updateOrderStatus(
  id: string,
  status: Order['status']
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Error updating order status:', error);
    return false;
  }

  return true;
}
