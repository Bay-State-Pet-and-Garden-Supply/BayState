import Link from 'next/link';
import { Plus, FileCode, MoreHorizontal, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

async function getConfigs() {
  const supabase = await createClient();

  const { data: configs, error } = await supabase
    .from('scraper_configs')
    .select(`
      *,
      versions:scraper_config_versions(
        status,
        version_number,
        published_at,
        validation_result
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

function getStatusBadge(status: string, validationResult: Record<string, unknown> | null) {
  if (status === 'published') {
    return <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" />Published</Badge>;
  }
  if (status === 'validated') {
    return <Badge variant="secondary"><CheckCircle className="mr-1 h-3 w-3" />Validated</Badge>;
  }
  if (status === 'draft') {
    return <Badge variant="outline"><AlertCircle className="mr-1 h-3 w-3" />Draft</Badge>;
  }
  return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Unknown</Badge>;
}

export default async function ScraperConfigsPage() {
  const configs = await getConfigs();

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Scraper Configs</h1>
          <p className="text-muted-foreground mt-1">
            Manage scraper configurations with the form-based editor.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/scraper-configs/new">
            <Plus className="mr-2 h-4 w-4" />
            New Config
          </Link>
        </Button>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <FileCode className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No configs yet</h2>
          <p className="text-muted-foreground mb-4">
            Create your first scraper configuration to get started.
          </p>
          <Button asChild variant="outline">
            <Link href="/admin/scraper-configs/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Config
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {configs.map((config: Record<string, unknown>) => (
            <div
              key={config.id as string}
              className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileCode className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">
                      {(config.display_name as string) || (config.name as string)}
                    </h3>
                    {getStatusBadge(
                      config.current_status as string,
                      config.validation_result as Record<string, unknown> | null
                    )}
                  </div>
                    <p className="text-sm text-muted-foreground">
                      {(config.slug as string)} • v{(config.current_version_number as number)}
                      {(config.latest_published_version as number) && (config.current_version_number as number) !== (config.latest_published_version as number) && (
                        <span className="text-muted-foreground">
                          {' '}(latest: v{config.latest_published_version as number})
                        </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  Updated {new Date(config.updated_at as string).toLocaleDateString()}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/scraper-configs/${config.id}/edit`}>
                        Edit Configuration
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/scraper-configs/${config.id}`}>
                        View Details
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
