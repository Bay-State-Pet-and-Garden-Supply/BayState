import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Settings, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

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

  const { data: config, error } = await supabase
    .from('scraper_configs')
    .select('*, versions:scraper_config_versions(*)')
    .eq('id', id)
    .single();

  if (error || !config) {
    notFound();
  }

  const currentVersion = config.versions?.find(
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
              <p className="text-muted-foreground">
                Configuration editor will be loaded here.
              </p>
              <pre className="mt-4 p-4 bg-muted rounded-lg overflow-auto text-sm">
                {JSON.stringify(currentVersion?.config || {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Test Runner</CardTitle>
              <CardDescription>
                Test your scraper configuration against real targets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Target URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/product"
                      className="mt-1 w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Test SKU</label>
                    <input
                      type="text"
                      placeholder="Enter a test SKU"
                      className="mt-1 w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>
                <Button className="w-full">
                  <Play className="mr-2 h-4 w-4" />
                  Start Test
                </Button>
              </div>
            </CardContent>
          </Card>
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
