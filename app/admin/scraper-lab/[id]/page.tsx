import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Settings, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { ConfigEditor } from '@/components/admin/scraper-lab/config-editor/ConfigEditor';

import { TestLabClient } from '@/components/admin/scraper-lab/TestLabClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  // Verify auth session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { title: 'Config | Scraper Lab' };
  }

  const { data: config } = await supabase
    .from('scraper_configs')
    .select('slug, display_name')
    .eq('id', id)
    .single();

  return {
    title: config ? `${config.display_name || config.slug} | Scraper Lab` : 'Config | Scraper Lab',
  };
}

export default async function ScraperLabConfigPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  // Explicitly refresh session to ensure cookies are valid
  // const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  // if (authError || !user) {
  //   console.error('Auth error:', authError);
  //   // For debugging - redirect to login with debug info
  //   const url = new URL('/login', 'http://localhost:3000');
  //   url.searchParams.set('error', authError?.message || 'auth_required');
  //   url.searchParams.set('message', 'Session not available. Please log in again.');
  //   return redirect(url.toString());
  // }

  // First get the config, then fetch versions separately to avoid RLS issues
  const { data: config, error } = await supabase
    .from('scraper_configs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !config) {
    // console.error('Config query failed:', { error, id, userId: user?.id });
    notFound();
  }

  // Fetch versions with explicit auth check
  const { data: versions } = await supabase
    .from('scraper_config_versions')
    .select('*')
    .eq('config_id', id)
    .order('created_at', { ascending: false });

  const currentVersion = versions?.find(
    (v: Record<string, unknown>) => v.id === config.current_version_id
  );

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/admin/scraper-lab">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Scraper Lab
          </Link>
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {config.display_name || config.slug}
            </h1>
            <p className="text-muted-foreground mt-1">
              Configuration and testing for {config.slug}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <Save className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button>
              <Play className="mr-2 h-4 w-4" />
              Run Test
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="config" className="w-full">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="test">Test Runner</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuration Editor</CardTitle>
              <CardDescription>
                Edit the scraper configuration using the form-based editor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigEditor configId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="mt-6">
          <TestLabClient
            scrapers={[{
              id: config.id,
              slug: config.slug,
              display_name: config.display_name,
              domain: config.domain || '',
              config: (currentVersion?.config as any) || {}
            }]}
            recentTests={[]}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Version History</CardTitle>
              <CardDescription>
                View and restore previous versions of this configuration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Version history will be displayed here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
