import { redirect } from 'next/navigation';

export default async function RunRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/scrapers/list`);
}
