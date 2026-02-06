/**
 * Scraper Detail Page - DEPRECATED
 *
 * This page has been migrated to the new configs system.
 * Redirecting to /admin/scrapers/configs/[id]
 */

import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ScraperDetailPage({ params }: PageProps) {
  const { id } = await params;
  
  // Redirect to the new configs system
  redirect(`/admin/scrapers/configs/${id}`);
}
