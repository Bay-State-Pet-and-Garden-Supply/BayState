import { getAllPromoCodes } from '@/lib/promo-codes';
import { PromotionsClient } from './promotions-client';

export default async function PromotionsPage() {
  const promoCodes = await getAllPromoCodes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Promotions</h1>
        <p className="text-muted-foreground">
          Create and manage discount codes for your customers.
        </p>
      </div>

      <PromotionsClient initialPromoCodes={promoCodes} />
    </div>
  );
}
