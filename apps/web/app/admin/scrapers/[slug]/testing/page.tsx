import { notFound } from 'next/navigation';
import { getScraperBySlug } from '../../actions-workbench';
import { TestingClient } from './testing-client';

interface TestingPageProps {
  params: Promise<{ slug: string }>;
}

export default async function TestingPage({ params }: TestingPageProps) {
  const { slug } = await params;
  const scraper = await getScraperBySlug(slug);

  if (!scraper) {
    notFound();
  }

  return (
    <div data-testid="tab-content-testing">
      <TestingClient scraper={scraper} />
    </div>
  );
}