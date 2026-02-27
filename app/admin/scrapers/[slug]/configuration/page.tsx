import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getScraperBySlug } from '../../actions-workbench';
import { SelectorEditor } from '@/components/admin/scrapers/selector-editor';
import { SettingsForm } from '@/components/admin/scrapers/settings-form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileEdit, CheckCircle2, AlertCircle } from 'lucide-react';
import { publishVersion, createNewVersion } from '@/lib/admin/scraper-configs/actions-normalized';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

interface ConfigurationPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ error?: string }>;
}

export default async function ConfigurationPage({ params, searchParams }: ConfigurationPageProps) {
  const { slug } = await params;
  const searchParamsData = await searchParams || {};
  const actionError = searchParamsData.error;
  const scraper = await getScraperBySlug(slug);

  if (!scraper || !scraper.id) {
    notFound();
  }

  const supabase = await createClient();

  // Get current version
  let version = null;
  if (scraper.current_version_id) {
    const { data } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', scraper.current_version_id)
      .single();
    version = data;
  } else {
    // Get latest version if no current version is set
    const { data } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('config_id', scraper.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();
    version = data;
  }

  if (!version) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border rounded-lg bg-muted/20">
        <FileEdit className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No Configuration Version</h3>
        <p className="text-muted-foreground mt-2 mb-4">
          This scraper does not have any configuration versions yet.
        </p>
        <form action={async () => {
          'use server';
          // Create initial version
          const supabase = await createClient();
          const { data: newVersion, error } = await supabase
            .from('scraper_config_versions')
            .insert({
              config_id: scraper.id,
              version_number: 1,
              status: 'draft',
              change_summary: 'Initial version',
              timeout: 30000,
              retries: 3,
              image_quality: 80,
            })
            .select()
            .single();
            
          if (!error && newVersion) {
            await supabase
              .from('scraper_configs')
              .update({ current_version_id: newVersion.id })
              .eq('id', scraper.id);
            revalidatePath(`/admin/scrapers/${slug}/configuration`);
          }
        }}>
          <Button type="submit">Initialize Configuration</Button>
        </form>
      </div>
    );
  }

  // Get selectors for this version
  const { data: selectors = [] } = await supabase
    .from('scraper_selectors')
    .select('*')
    .eq('version_id', version.id)
    .order('sort_order', { ascending: true });

  const isDraft = version.status === 'draft';

  return (
    <div className="space-y-6 pb-12" data-testid="tab-content-configuration">
      {/* Error Alert */}
      {actionError && (
        <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Version Header */}
      <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold" data-testid="configuration-version-label">Version {version.version_number}</h2>
              <Badge variant={isDraft ? "secondary" : "default"} className={!isDraft ? "bg-green-600 hover:bg-green-700" : ""}>
                {isDraft ? 'Draft' : 'Published'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {version.change_summary || (isDraft ? 'Unpublished changes' : 'Active configuration')}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {isDraft ? (
            <form action={async () => {
              'use server';
              const result = await publishVersion(version.id);
              if (!result.success) {
                redirect(`/admin/scrapers/${slug}/configuration?error=${encodeURIComponent(result.error || 'Failed to publish')}`);
              }
              revalidatePath(`/admin/scrapers/${slug}/configuration`);
            }}>
              <Button type="submit" variant="default" className="gap-2" data-testid="publish-version-button">
                <CheckCircle2 className="w-4 h-4" />
                Publish Version
              </Button>
            </form>
          ) : (
            <form action={async () => {
              'use server';
              if (scraper.id) {
                const result = await createNewVersion(scraper.id);
                if (!result.success) {
                  redirect(`/admin/scrapers/${slug}/configuration?error=${encodeURIComponent(result.error || 'Failed to create version')}`);
                }
                revalidatePath(`/admin/scrapers/${slug}/configuration`);
              }
            }}>
              <Button type="submit" variant="outline" className="gap-2" data-testid="create-new-version-button">
                <FileEdit className="w-4 h-4" />
                Edit Draft
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Selectors */}
        <div className="xl:col-span-2 space-y-6">
          <SelectorEditor 
            versionId={version.id} 
            selectors={selectors || []} 
            isReadOnly={!isDraft}
            versionStatus={version.status}
          />
        </div>

        {/* Right Column: Settings */}
        <div className="space-y-6">
          <SettingsForm 
            version={version} 
            scraperType={scraper.scraper_type || 'static'} 
            isReadOnly={!isDraft}
          />
        </div>
      </div>
    </div>
  );
}
