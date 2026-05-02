import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getReviews, getReviewStats } from '@/lib/admin/reviews';
import { AdminReviewsClient } from '@/components/admin/reviews/AdminReviewsClient';

export default async function AdminReviewsPage() {
  const [{ reviews, count }, stats] = await Promise.all([
    getReviews({ limit: 100 }),
    getReviewStats(),
  ]);

  return (
    <AdminPageShell title="Reviews">
      <AdminReviewsClient
        initialReviews={reviews}
        totalCount={count}
        stats={stats}
      />
    </AdminPageShell>
  );
}
