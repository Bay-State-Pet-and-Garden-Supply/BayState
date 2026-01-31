'use server';

import Link from 'next/link';
import { Plus, FileCode, Settings, Play, FlaskConical } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface ScraperConfig {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string | null;
  created_at: string;
  updated_at: string;
  current_version_id: string | null;
  version_status?: string | null;
}

async function getConfigs(): Promise<ScraperConfig[]> {
  const supabase = await createAdminClient();

  const { data: configs, error } = await supabase
    .from('scraper_configs')
    .select(`
      id,
      slug,
      display_name,
      domain,
      created_at,
      updated_at,
      current_version_id
    `)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching configs:', error);
    return [];
  }

  // Fetch version status for each config
  const configsWithStatus = await Promise.all(
    (configs || []).map(async (config) => {
      if (!config.current_version_id) {
        return { ...config, version_status: null };
      }

      const { data: version } = await supabase
        .from('scraper_config_versions')
        .select('status')
        .eq('id', config.current_version_id)
        .single();

      return {
        ...config,
        version_status: version?.status || null,
      };
    })
  );

  return configsWithStatus;
}

function getStatusBadge(status: string | null | undefined) {
  if (!status) {
    return (
      <Badge variant="outline" className="bg-gray-100 text-gray-800 border-transparent">
        Unknown
      </Badge>
    );
  }

  const normalizedStatus = status.toLowerCase();

  const configMap: Record<string, { label: string; className: string }> = {
    draft: {
      label: 'Draft',
      className: 'bg-yellow-100 text-yellow-800 border-transparent',
    },
    validated: {
      label: 'Validated',
      className: 'bg-blue-100 text-blue-800 border-transparent',
    },
    published: {
      label: 'Published',
      className: 'bg-green-100 text-green-800 border-transparent',
    },
  };

  const config = configMap[normalizedStatus] || {
    label: status,
    className: 'bg-gray-100 text-gray-800 border-transparent',
  };

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

export async function ScraperLabLanding() {
  const configs = await getConfigs();

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Scraper Lab</h1>
          <p className="text-muted-foreground mt-1">
            Unified configuration and testing interface for scraper configs.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/admin/scraper-lab">
              <FlaskConical className="mr-2 h-4 w-4" />
              Run Tests
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/scraper-lab/new">
              <Plus className="mr-2 h-4 w-4" />
              New Config
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
          <Link href="/admin/scraper-lab/new">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create New
              </CardTitle>
              <CardDescription>
                Start from scratch with a blank configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Use the wizard to create a new scraper configuration with step-by-step guidance.
              </p>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
          <Link href="/admin/scraper-lab/new">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                YAML Editor
              </CardTitle>
              <CardDescription>
                Edit configurations using YAML
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Direct YAML editing for advanced users who prefer raw configuration files.
              </p>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
          <Link href="/admin/scraper-lab">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Quick Test
              </CardTitle>
              <CardDescription>
                Test scrapers without a saved config
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Run quick tests with ad-hoc configurations to validate selectors and workflows.
              </p>
            </CardContent>
          </Link>
        </Card>
      </div>

      {/* Saved Configurations */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Saved Configurations</h2>
        {configs.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/50">
            <FileCode className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No configurations yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first scraper configuration to get started.
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/scraper-lab/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Config
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {configs.map((config) => (
              <Link
                key={config.id}
                href={`/admin/scraper-lab/${config.id}`}
                className="block"
              >
                <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Settings className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {config.display_name || config.slug}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {config.slug}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(config.version_status)}
                    <div className="text-sm text-muted-foreground hidden md:block">
                      Updated {new Date(config.updated_at).toLocaleDateString()}
                    </div>
                    <Button variant="outline" size="sm">
                      <Play className="mr-2 h-4 w-4" />
                      Test
                    </Button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
