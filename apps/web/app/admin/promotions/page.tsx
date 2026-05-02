import { getAllPromoCodes } from '@/lib/promo-codes';
import { PromotionsClient } from './promotions-client';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

export default async function PromotionsPage() {
  const promoCodes = await getAllPromoCodes();

  return (
    <AdminPageShell title="Promotions" description="Create and manage discount codes for your customers.">
      <PromotionsClient initialPromoCodes={promoCodes} />
    </AdminPageShell>
  );
}
