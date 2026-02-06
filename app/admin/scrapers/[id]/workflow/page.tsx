/**
 * Workflow Builder Page - DEPRECATED
 *
 * This page has been migrated to the new configs system.
 * Redirecting to /admin/scrapers/configs/[id]/edit?tab=workflow
 */

import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkflowBuilderPage({ params }: PageProps) {
  const { id } = await params;
  
  // Redirect to the new configs system with workflow tab
  redirect(`/admin/scrapers/configs/${id}/edit?tab=workflow`);
}
