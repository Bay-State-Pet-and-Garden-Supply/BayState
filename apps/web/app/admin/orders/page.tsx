import { getOrders } from '@/lib/orders';
import { AdminOrdersClient } from '@/components/admin/orders/AdminOrdersClient';

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; customer_email?: string }>
}) {
  const params = await searchParams;
  
  // If q looks like an email, treat it as customerEmail filter
  const customerEmail = params.customer_email || (params.q && params.q.includes('@') ? params.q : undefined);

  const { orders, count } = await getOrders({ 
    limit: 1000,
    status: params.status,
    customerEmail,
  });
  
  const ordersList = orders || [];

  return (
    <AdminOrdersClient
      initialOrders={ordersList}
      totalCount={count}
    />
  );
}
