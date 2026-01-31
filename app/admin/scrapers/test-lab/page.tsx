import { redirect } from 'next/navigation';

export default async function TestLabRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const queryString = new URLSearchParams(params as any).toString();
  redirect(`/admin/scraper-lab${queryString ? `?${queryString}` : ''}`);
}
