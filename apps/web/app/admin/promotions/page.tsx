import { Sparkles } from 'lucide-react';
import { getAllPromoCodes } from '@/lib/promo-codes';
import { PromotionsClient } from './promotions-client';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

export default async function PromotionsPage() {
  const promoCodes = await getAllPromoCodes();

  return (
    <AdminPageShell
      title="Promotions"
      description="Create and manage discount codes without burying the rules that affect storefront pricing."
      icon={<Sparkles className="h-5 w-5" />}
      eyebrow="Queue view"
    >
      <PromotionsClient initialPromoCodes={promoCodes} />
    </AdminPageShell>
  );
}
