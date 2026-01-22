import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createScraperConfig } from '@/lib/admin/scraper-configs/actions';
import { ConfigEditorClient } from '@/components/admin/scraper-configs/ConfigEditorClient';

export const metadata: Metadata = {
  title: 'Create Config | Admin',
  description: 'Create a new web scraper configuration',
};

export default async function CreateScraperConfigPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
      <div className="flex-1 overflow-hidden">
        <ConfigEditorClient mode="create" />
      </div>
    </div>
  );
}
