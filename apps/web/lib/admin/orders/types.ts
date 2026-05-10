export type AdminOrderSource =
  | 'web'
  | 'shopsite'
  | 'integra'
  | 'manual'
  | 'import';

export type AdminOrderListFilters = {
  q?: string;
  source?: AdminOrderSource;
  status?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  fulfillmentMethod?: 'pickup' | 'delivery';
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

/** Row shape from the admin_orders_list database view */
export interface AdminOrderListRow {
  id: string;
  order_number: string;
  source_type: AdminOrderSource;
  source_system: string | null;
  external_order_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  status: string;
  payment_method: string;
  payment_status: string;
  fulfillment_method: string | null;
  fulfillment_status: string;
  subtotal: number;
  tax: number | null;
  total: number;
  created_at: string;
  updated_at: string | null;
  item_count: number;
  total_quantity: number;
}
