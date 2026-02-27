import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getScraperBySlug } from '../../actions-workbench';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon, Wrench } from 'lucide-react';

interface TestLabPageProps {
  params: Promise<{ slug: string }>;
}

export default async function TestLabPage({ params }: TestLabPageProps) {
  const { slug } = await params;
  const scraper = await getScraperBySlug(slug);

  if (!scraper || !scraper.id) {
    notFound();
  }

  return (
    <div className="space-y-6" data-testid="tab-content-test-lab">
      <Alert>
        <Wrench className="h-4 w-4" />
        <AlertTitle>Test Lab Migration Pending</AlertTitle>
        <AlertDescription>
          The Test Lab is being migrated to the new Studio interface. 
          Please use the Studio for running tests until the migration is complete.
        </AlertDescription>
      </Alert>
    </div>
  );
}
