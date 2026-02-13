import { Metadata } from 'next';
import StudioClient from '@/components/admin/scrapers/StudioClient';

export const metadata: Metadata = {
  title: 'Scraper Studio | Admin',
  description: 'Advanced environment for scraper development and testing',
};

export default function ScraperStudioPage() {
  return <StudioClient />;
}
