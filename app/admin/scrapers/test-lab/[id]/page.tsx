import { redirect } from 'next/navigation';

export default async function TestLabRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/scrapers/list`);
}
