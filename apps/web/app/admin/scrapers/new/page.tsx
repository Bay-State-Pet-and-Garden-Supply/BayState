import { Metadata } from 'next';
import { ScraperWizardClient } from '@/components/admin/scrapers/ScraperWizardClient';

export const metadata: Metadata = {
  title: 'New Scraper | Admin',
  description: 'Create a new scraper configuration',
};

export default function NewScraperPage() {
  return <ScraperWizardClient />;
}
