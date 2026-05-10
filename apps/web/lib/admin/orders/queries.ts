import { createClient } from '@/lib/supabase/server';
import type { AdminOrderListFilters, AdminOrderListRow } from './types';

export async function getAdminOrders(filters: AdminOrderListFilters): Promise<{
  orders: AdminOrderListRow[];
  count: number;
}> {
  const supabase = await createClient();

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('admin_orders_list')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.source) {
    query = query.eq('source_type', filters.source);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.paymentStatus) {
    query = query.eq('payment_status', filters.paymentStatus);
  }

  if (filters.fulfillmentStatus) {
    query = query.eq('fulfillment_status', filters.fulfillmentStatus);
  }

  if (filters.fulfillmentMethod) {
    query = query.eq('fulfillment_method', filters.fulfillmentMethod);
  }

  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  if (filters.q) {
    const sanitized = filters.q.trim().replace(/[%_,]/g, '');
    if (sanitized.length > 0) {
      const searchTerm = `%${sanitized}%`;
      query = query.or(
        `order_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_email.ilike.${searchTerm},external_order_id.ilike.${searchTerm}`
      );
    }
  }

  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching admin orders:', error);
    return { orders: [], count: 0 };
  }

  return {
    orders: (data ?? []) as AdminOrderListRow[],
    count: count ?? 0,
  };
}
