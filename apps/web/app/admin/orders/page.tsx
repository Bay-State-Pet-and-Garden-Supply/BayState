import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getAdminOrders } from '@/lib/admin/orders/queries';
import { AdminOrdersClient } from '@/components/admin/orders/AdminOrdersClient';
import type { AdminOrderListFilters } from '@/lib/admin/orders/types';

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ 
    q?: string; 
    status?: string; 
    source?: string;
    payment_status?: string;
    fulfillment_status?: string;
    fulfillment_method?: string;
    date_from?: string;
    date_to?: string;
    page?: string;
    page_size?: string;
  }>
}) {
  const params = await searchParams;

  const filters: AdminOrderListFilters = {
    q: params.q,
    source: params.source as AdminOrderListFilters['source'],
    status: params.status,
    paymentStatus: params.payment_status,
    fulfillmentStatus: params.fulfillment_status,
    fulfillmentMethod: params.fulfillment_method as AdminOrderListFilters['fulfillmentMethod'],
    dateFrom: params.date_from,
    dateTo: params.date_to,
    page: Number(params.page ?? 1),
    pageSize: Number(params.page_size ?? 50),
  };

  const { orders, count } = await getAdminOrders(filters);

  return (
    <AdminPageShell title="Orders">
      <AdminOrdersClient
        initialOrders={orders}
        totalCount={count}
        initialQ={params.q}
        initialSource={params.source}
        initialPaymentStatus={params.payment_status}
        initialFulfillmentStatus={params.fulfillment_status}
        initialFulfillmentMethod={params.fulfillment_method}
        initialDateFrom={params.date_from}
        initialDateTo={params.date_to}
      />
    </AdminPageShell>
  );
}
