'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  RefreshCw,
  MoreHorizontal,
  Edit,
  Copy,
  Trash2,
  ExternalLink,
  Play,
  FileCode2,
  Settings2,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Layers,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfigVersion {
  id: string;
  version_number: number;
  status: string;
  published_at: string | null;
  validation_result: Record<string, unknown> | null;
}

interface ScraperConfig {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string | null;
  created_at: string;
  updated_at: string;
  current_version_id: string | null;
  versions?: ConfigVersion[];
  version_count?: number;
}

interface ConfigsClientProps {
  initialConfigs: ScraperConfig[];
  totalCount: number;
}

export function ConfigsClient({ initialConfigs, totalCount }: ConfigsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [configs] = useState<ScraperConfig[]>(initialConfigs);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ScraperConfig | null>(null);

  const filteredConfigs = configs.filter((config) =>
    config.slug.toLowerCase().includes(search.toLowerCase()) ||
    (config.display_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (config.domain?.toLowerCase() || '').includes(search.toLowerCase())
  );

  const getVersionCount = (config: ScraperConfig) => {
    return config.versions?.length || config.version_count || 0;
  };

  const getLatestVersion = (config: ScraperConfig) => {
    if (!config.versions || config.versions.length === 0) return null;
    return config.versions.reduce((max, v) =>
      v.version_number > max.version_number ? v : max
    , config.versions[0]);
  };

  const getStatusBadge = (status: string | null | undefined) => {
    if (status === 'published') {
      return <Badge variant="default"><CheckCircle2 className="mr-1 h-3 w-3" />Published</Badge>;
    }
    if (status === 'validated') {
      return <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />Validated</Badge>;
    }
    if (status === 'draft') {
      return <Badge variant="outline"><AlertCircle className="mr-1 h-3 w-3" />Draft</Badge>;
    }
    return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Unknown</Badge>;
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    startTransition(async () => {
      try {
        const supabase = await import('@/lib/supabase/client').then(m => m.createClient());
        const { error } = await supabase
          .from('scraper_configs')
          .delete()
          .eq('id', deleteTarget.id);

        if (error) throw error;

        toast.success('Config deleted successfully');
        setDeleteTarget(null);
        router.refresh();
      } catch (error) {
        toast.error('Failed to delete config');
      }
    });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <Layers className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scraper Configs</h1>
            <p className="text-sm text-gray-600">
              {totalCount} configuration{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/scrapers/network">
              <Settings2 className="mr-2 h-4 w-4" />
              Runner Network
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/scrapers/configs/new">
              <Plus className="mr-2 h-4 w-4" />
              New Config
            </Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
          <Input
            placeholder="Search configs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={() => router.refresh()} disabled={isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Configs List */}
      {filteredConfigs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileCode2 className="h-12 w-12 text-gray-600" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {search ? 'No configs match your search' : 'No configs yet'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {search
                ? 'Try adjusting your search terms'
                : 'Create your first scraper configuration to get started'}
            </p>
            {!search && (
              <Button className="mt-4" asChild>
                <Link href="/admin/scrapers/configs/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Config
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredConfigs.map((config) => {
            const latestVersion = getLatestVersion(config);
            const versionCount = getVersionCount(config);

            return (
              <Card key={config.id} className="hover:border-gray-400 transition-colors">
                <CardContent className="flex items-center justify-between p-4">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/scrapers/configs/${config.id}`}
                        className="text-lg font-medium text-gray-900 hover:text-blue-600 truncate"
                      >
                        {config.display_name || config.slug}
                      </Link>
                      {getStatusBadge(latestVersion?.status)}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-600">
                      <span className="font-mono">{config.slug}</span>
                      <span>{versionCount} version{versionCount !== 1 ? 's' : ''}</span>
                      {latestVersion && (
                        <span>v{latestVersion.version_number}</span>
                      )}
                      <span>Updated {format(new Date(config.updated_at), 'MMM d, yyyy')}</span>
                    </div>
                    {config.description && (
                      <p className="mt-1 text-sm text-gray-500 truncate">
                        {config.description}
                      </p>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/scrapers/configs/${config.id}`}>
                        <Eye className="mr-1 h-3 w-3" />
                        View
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/scrapers/configs/${config.id}/edit`}>
                        <Edit className="mr-1 h-3 w-3" />
                        Edit
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/scrapers/configs/${config.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/scrapers/configs/${config.id}/edit`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Configuration
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/admin/scrapers/test-lab`}>
                            <Play className="mr-2 h-4 w-4" />
                            Test Config
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => setDeleteTarget(config)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.display_name || deleteTarget?.slug}"?
              This action cannot be undone and will delete all versions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
