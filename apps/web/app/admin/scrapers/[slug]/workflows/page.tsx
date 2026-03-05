import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowStepEditor } from '@/components/admin/scrapers/workflow-step-editor';
import { ActionPalette } from '@/components/admin/scrapers/action-palette';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';

interface ScraperWorkflowsPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function ScraperWorkflowsPage({ params }: ScraperWorkflowsPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  // 1. Fetch the config by slug
  const { data: config, error: configError } = await supabase
    .from('scraper_configs')
    .select('id, display_name, current_version_id')
    .eq('slug', slug)
    .single();

  if (configError || !config) {
    notFound();
  }

  // 2. We need a current version to show workflows
  if (!config.current_version_id) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflow Builder</h1>
          <p className="text-muted-foreground mt-2">
            Configure the step-by-step actions for this scraper.
          </p>
        </div>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No Active Version</AlertTitle>
          <AlertDescription>
            This scraper doesn&apos;t have an active version yet. Please go to the configuration tab to create one first.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // 3. Fetch version details to check status
  const { data: version } = await supabase
    .from('scraper_config_versions')
    .select('status, version_number')
    .eq('id', config.current_version_id)
    .single();

  const isReadOnly = version?.status === 'published';

  return (
    <div className="space-y-6" data-testid="tab-content-workflows">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflow Builder</h1>
          <p className="text-muted-foreground mt-2">
            Design the execution flow for {config.display_name || slug} (v{version?.version_number || '?'})
          </p>
        </div>
      </div>

      {isReadOnly && (
        <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
          <Info className="h-4 w-4" />
          <AlertTitle>Read-Only Mode</AlertTitle>
          <AlertDescription>
            This version is published and cannot be edited. Create a new draft version to make changes.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="lg:col-span-3">
          <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-xl" />}>
            <WorkflowStepsLoader versionId={config.current_version_id} isReadOnly={isReadOnly} />
          </Suspense>
        </div>
        
        <div className="lg:col-span-1 hidden lg:block sticky top-6">
          <ActionPalette isReadOnly={isReadOnly} />
        </div>
      </div>
    </div>
  );
}

async function WorkflowStepsLoader({ versionId, isReadOnly }: { versionId: string, isReadOnly: boolean }) {
  const supabase = await createClient();
  
  const { data: steps, error } = await supabase
    .from('scraper_workflow_steps')
    .select('*')
    .eq('version_id', versionId)
    .order('sort_order', { ascending: true });
    
  if (error) {
    console.error('Error loading workflow steps:', error);
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading workflow steps</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <WorkflowStepEditor 
      versionId={versionId} 
      steps={steps || []} 
      isReadOnly={isReadOnly} 
    />
  );
}
