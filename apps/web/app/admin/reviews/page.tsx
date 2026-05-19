import { Star } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getReviews, getReviewStats } from '@/lib/admin/reviews';
import { AdminReviewsClient } from '@/components/admin/reviews/AdminReviewsClient';

export default async function AdminReviewsPage() {
  const [{ reviews, count }, stats] = await Promise.all([
    getReviews({ limit: 100 }),
    getReviewStats(),
  ]);

  return (
    <AdminPageShell
      title="Reviews"
      description="Moderate product reviews, resolve pending items, and keep storefront feedback clean and trustworthy."
      icon={<Star className="h-5 w-5" />}
      eyebrow="Queue view"
    >
      <AdminReviewsClient initialReviews={reviews} totalCount={count} stats={stats} />
    </AdminPageShell>
  );
}
