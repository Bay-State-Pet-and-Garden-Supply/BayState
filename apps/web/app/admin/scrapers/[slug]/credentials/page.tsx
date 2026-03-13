import { notFound } from 'next/navigation';
import { getScraperBySlug } from '../../actions-workbench';
import { ScraperCredentialsCard } from '@/components/admin/scrapers/ScraperCredentialsCard';

interface CredentialsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CredentialsPage({ params }: CredentialsPageProps) {
  const { slug } = await params;
  const scraper = await getScraperBySlug(slug);

  if (!scraper) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto" data-testid="tab-content-credentials">
      <ScraperCredentialsCard slug={slug} />
    </div>
  );
}
