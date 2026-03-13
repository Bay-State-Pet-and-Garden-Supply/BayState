import Link from 'next/link';
import { 
  FileCode, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  TrendingUp,
  Activity,
  RefreshCw
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function getStats() {
  const supabase = await createClient();

  // Get all configs with version info
  const { data: configs } = await supabase
    .from('scraper_configs')
    .select(`
      *,
      versions:scraper_config_versions!fk_config_id(
        status,
        version_number,
        published_at,
        validation_result
      )
    `)
    .order('updated_at', { ascending: false });

  if (!configs) {
    return { total: 0, published: 0, validated: 0, draft: 0, recentActivity: [] };
  }

  const stats = {
    total: configs.length,
    published: 0,
    validated: 0,
    draft: 0,
    archived: 0,
    recentActivity: [] as Array<{
      id: string;
      slug: string;
      displayName: string;
      action: string;
      timestamp: string;
      userId: string;
    }>,
  };

  for (const config of configs) {
    const versions = config.versions || [];
    const currentVersion = versions.find((v: Record<string, unknown>) => v.id === config.current_version_id);
    const status = currentVersion?.status || 'unknown';
    
    if (status === 'published') stats.published++;
    else if (status === 'validated') stats.validated++;
    else if (status === 'draft') stats.draft++;
    else stats.archived++;

    // Build recent activity from version history
    for (const version of versions.slice(0, 3)) {
      if (version.status === 'published' && version.published_at) {
        stats.recentActivity.push({
          id: version.id,
          slug: config.slug,
          displayName: config.display_name || config.name || config.slug,
          action: `Published v${version.version_number}`,
          timestamp: version.published_at,
          userId: version.published_by || '',
        });
      }
    }
  }

  // Sort by timestamp and take top 10
  stats.recentActivity = stats.recentActivity
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  return stats;
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default async function ScraperConfigsDashboard() {
  const stats = await getStats();

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Scraper Configs Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of all scraper configurations and their status.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/scraper-configs/new">
            <RefreshCw className="mr-2 h-4 w-4" />
            New Config
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Configs</CardTitle>
            <FileCode className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              Across all scrapers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Published</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.published}</div>
            <p className="text-xs text-muted-foreground">
              Ready for production
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Validated</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats.validated}</div>
            <p className="text-xs text-muted-foreground">
              Ready to publish
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{stats.draft}</div>
            <p className="text-xs text-muted-foreground">
              In development
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentActivity.length > 0 ? (
              <div className="space-y-4">
                {stats.recentActivity.map((activity, index) => (
                  <div key={activity.id + index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <CheckCircle className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {activity.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.action}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(activity.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Activity className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full justify-start">
              <Link href="/admin/scraper-configs">
                <FileCode className="mr-2 h-4 w-4" />
                View All Configs
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/admin/scraper-configs/new">
                <RefreshCw className="mr-2 h-4 w-4" />
                Create New Config
              </Link>
            </Button>
            
            {stats.draft > 0 && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  <span className="font-medium text-yellow-500">Action Needed</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  You have {stats.draft} draft {stats.draft === 1 ? 'configuration' : 'configurations'} waiting for validation.
                </p>
                <Button asChild variant="link" className="px-0 mt-2">
                  <Link href="/admin/scraper-configs">
                    Review drafts →
                  </Link>
                </Button>
              </div>
            )}

            {stats.validated > 0 && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-blue-500" />
                  <span className="font-medium text-blue-500">Ready to Publish</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {stats.validated} validated {stats.validated === 1 ? 'configuration' : 'configurations'} ready for production.
                </p>
                <Button asChild variant="link" className="px-0 mt-2">
                  <Link href="/admin/scraper-configs">
                    Publish now →
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
