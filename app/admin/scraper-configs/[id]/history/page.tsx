import Link from 'next/link';
import { ArrowLeft, History, CheckCircle, XCircle, AlertCircle, Clock, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

async function getConfigVersions(configId: string) {
  const supabase = await createClient();

  const { data: config, error: configError } = await supabase
    .from('scraper_configs')
    .select('*, current_version_id')
    .eq('id', configId)
    .single();

  if (configError || !config) {
    return null;
  }

  const { data: versions, error: versionsError } = await supabase
    .from('scraper_config_versions')
    .select('*')
    .eq('config_id', configId)
    .order('version_number', { ascending: false });

  if (versionsError) {
    return null;
  }

  return { config, versions: versions || [] };
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'published':
      return <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" />Published</Badge>;
    case 'validated':
      return <Badge variant="secondary"><CheckCircle className="mr-1 h-3 w-3" />Validated</Badge>;
    case 'draft':
      return <Badge variant="outline"><AlertCircle className="mr-1 h-3 w-3" />Draft</Badge>;
    case 'archived':
      return <Badge variant="secondary"><XCircle className="mr-1 h-3 w-3" />Archived</Badge>;
    default:
      return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Unknown</Badge>;
  }
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString();
}

interface VersionHistoryPageProps {
  params: Promise<{ id: string }>;
}

export default async function VersionHistoryPage({ params }: VersionHistoryPageProps) {
  const { id: configId } = await params;
  const data = await getConfigVersions(configId);

  if (!data) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/scraper-configs">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Version History</h1>
            <p className="text-muted-foreground">Config not found</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              The requested configuration was not found.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { config, versions } = data;
  const currentVersionId = config.current_version_id;

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/scraper-configs">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Version History</h1>
          <p className="text-muted-foreground">
            {config.display_name || config.name} ({config.slug})
          </p>
        </div>
      </div>

      {/* Version Timeline */}
      <div className="space-y-4">
        {versions.map((version, index) => {
          const isCurrent = version.id === currentVersionId;
          const validationResult = version.validation_result as {
            valid: boolean;
            validated_at?: string;
            errors?: string[];
          } | null;
          
          return (
            <Card key={version.id} className={isCurrent ? 'border-primary' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted font-mono font-bold">
                      v{version.version_number}
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        Version {version.version_number}
                        {isCurrent && (
                          <Badge variant="outline" className="text-xs">
                            Current
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {getStatusBadge(version.status)}
                      </p>
                    </div>
                  </div>
                  {version.status === 'validated' && !isCurrent && (
                    <Button size="sm" variant="outline">
                      Publish This Version
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Metadata */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block">Created</span>
                    <span className="flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(version.created_at)}
                    </span>
                  </div>
                  {version.published_at && (
                    <div>
                      <span className="text-muted-foreground block">Published</span>
                      <span className="flex items-center gap-1 mt-1">
                        <CheckCircle className="h-3 w-3" />
                        {formatDate(version.published_at)}
                      </span>
                    </div>
                  )}
                  {version.published_by && (
                    <div>
                      <span className="text-muted-foreground block">Published By</span>
                      <span className="flex items-center gap-1 mt-1">
                        <User className="h-3 w-3" />
                        User {version.published_by.slice(0, 8)}...
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground block">Schema</span>
                    <span className="font-mono">{version.schema_version}</span>
                  </div>
                </div>

                {/* Validation Result */}
                {validationResult && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      {validationResult.valid ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium">
                        Validation: {validationResult.valid ? 'Passed' : 'Failed'}
                      </span>
                      {validationResult.validated_at && (
                        <span className="text-muted-foreground text-sm">
                          at {formatDate(validationResult.validated_at)}
                        </span>
                      )}
                    </div>
                    {validationResult.errors && (validationResult.errors as string[]).length > 0 && (
                      <ul className="text-sm text-destructive space-y-1">
                        {(validationResult.errors as string[]).map((error, i) => (
                          <li key={i}>• {error}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Change Summary */}
                {version.change_summary && (
                  <div>
                    <span className="text-muted-foreground text-sm block">Change Summary</span>
                    <p className="mt-1">{version.change_summary}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/scraper-configs/${config.id}/edit?version=${version.id}`}>
                      View/Edit
                    </Link>
                  </Button>
                  {version.status === 'published' && !isCurrent && (
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                      Rollback to v{version.version_number}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {versions.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <History className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No versions yet</h3>
              <p className="text-muted-foreground">
                Create a draft to start tracking version history.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
