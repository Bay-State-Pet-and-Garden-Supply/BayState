import Link from 'next/link';
import { Plus, FileCode, CheckCircle, XCircle, AlertCircle, Settings2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfigQuickActions } from '@/components/admin/scraper-configs/ConfigQuickActions';

async function getConfigs() {
  const supabase = await createClient();

  const { data: configs, error } = await supabase
    .from('scraper_configs')
    .select(`
      *,
      versions:scraper_config_versions!fk_config_id(
        id,
        status,
        version_number,
        published_at,
        validation_result,
        config
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching configs:', error);
    return [];
  }

  return configs.map((config) => {
    const versions = config.versions || [];
    const currentVersion = versions.find((v: Record<string, unknown>) => v.id === config.current_version_id);
    const latestPublished = versions
      .filter((v: Record<string, unknown>) => v.status === 'published')
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => 
        ((b.version_number as number) || 0) - ((a.version_number as number) || 0)
      )[0];

    return {
      ...config,
      current_status: currentVersion?.status || 'unknown',
      current_version_number: currentVersion?.version_number || 0,
      latest_published_version: latestPublished?.version_number || null,
      validation_result: currentVersion?.validation_result || null,
    };
  });
}

function getStatusBadge(status: string) {
  if (status === 'published') {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle className="h-3 w-3" />
        Published
      </Badge>
    );
  }
  if (status === 'validated') {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle className="h-3 w-3" />
        Validated
      </Badge>
    );
  }
  if (status === 'draft') {
    return (
      <Badge variant="outline" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Draft
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" />
      Unknown
    </Badge>
  );
}

export default async function ScraperConfigsPage() {
  const configs = await getConfigs();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Settings2 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scraper Configs</h1>
            <p className="text-sm text-gray-600">
              Manage scraper configurations with the form-based editor
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/admin/scrapers/configs/new">
            <Plus className="mr-2 h-4 w-4" />
            New Config
          </Link>
        </Button>
      </div>

      {/* Configs List */}
      {configs.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileCode className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No configs yet</h2>
            <p className="text-muted-foreground mb-4">
              Create your first scraper configuration to get started.
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/scrapers/configs/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Config
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {configs.map((config: Record<string, unknown>) => (
            <Card
              key={config.id as string}
              className="hover:border-purple-400 transition-colors"
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileCode className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">
                        {(config.display_name as string) || (config.name as string)}
                      </h3>
                      {getStatusBadge(config.current_status as string)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {(config.slug as string)} • v{(config.current_version_number as number)}
                      {(config.latest_published_version as number) &&
                        (config.current_version_number as number) !==
                          (config.latest_published_version as number) && (
                          <span className="text-muted-foreground">
                            {' '}
                            (latest: v{config.latest_published_version as number})
                          </span>
                        )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Updated {new Date(config.updated_at as string).toLocaleDateString()}
                  </div>
                  <ConfigQuickActions
                    configId={config.id as string}
                    configSlug={config.slug as string}
                    currentStatus={config.current_status as string}
                    latestPublishedVersion={config.latest_published_version as number | null}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
