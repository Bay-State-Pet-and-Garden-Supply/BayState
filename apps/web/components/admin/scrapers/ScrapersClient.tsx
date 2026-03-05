'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { ScraperRecord } from '@/lib/admin/scrapers/types';
import { ScraperStatusBadge, ScraperHealthBadge } from './ScraperStatusBadge';
import {
  createScraper,
  deleteScraper,
  duplicateScraper,
} from '@/app/admin/scrapers/actions';

interface ScrapersClientProps {
  initialScrapers: ScraperRecord[];
  totalCount: number;
}

export function ScrapersClient({ initialScrapers, totalCount }: ScrapersClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scrapers] = useState<ScraperRecord[]>(initialScrapers);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScraperRecord | null>(null);

  // Form state for create dialog
  const [newName, setNewName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');

  const filteredScrapers = scrapers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.display_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    s.base_url.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newName.trim() || !newBaseUrl.trim()) {
      toast.error('Name and Base URL are required');
      return;
    }

    startTransition(async () => {
      const result = await createScraper(newName.trim(), newBaseUrl.trim(), newDisplayName.trim() || undefined);
      if (result.success) {
        toast.success('Scraper created successfully');
        setIsCreateOpen(false);
        setNewName('');
        setNewDisplayName('');
        setNewBaseUrl('');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to create scraper');
      }
    });
  };

  const handleDuplicate = async (scraper: ScraperRecord) => {
    startTransition(async () => {
      const result = await duplicateScraper(scraper.id);
      if (result.success) {
        toast.success('Scraper duplicated successfully');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to duplicate scraper');
      }
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteScraper(deleteTarget.id);
      if (result.success) {
        toast.success('Scraper deleted successfully');
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to delete scraper');
      }
    });
  };

  const getWorkflowCount = (scraper: ScraperRecord) => {
    return scraper.config?.workflows?.length || 0;
  };

  const getSelectorCount = (scraper: ScraperRecord) => {
    return scraper.config?.selectors?.length || 0;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <FileCode2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scraper Configs</h1>
            <p className="text-sm text-gray-600">
              {totalCount} scraper configuration{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/scraper-network">
              <Settings2 className="mr-2 h-4 w-4" />
              Runner Network
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/scrapers/new">
              <Plus className="mr-2 h-4 w-4" />
              New Scraper
            </Link>
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            placeholder="Search scrapers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <Button variant="outline" onClick={() => router.refresh()} disabled={isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Scrapers List */}
      {filteredScrapers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileCode2 className="h-12 w-12 text-gray-600" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {search ? 'No scrapers match your search' : 'No scrapers yet'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {search
                ? 'Try adjusting your search terms'
                : 'Create your first scraper configuration to get started'}
            </p>
            {!search && (
              <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Scraper
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredScrapers.map((scraper) => (
            <Card key={scraper.name} className="hover:border-gray-400 transition-colors">
              <CardContent className="flex items-center justify-between p-4">
                {/* Left: Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/scrapers/${scraper.id}`}
                      className="text-lg font-medium text-gray-900 hover:text-blue-600 truncate"
                    >
                      {scraper.display_name || scraper.name}
                    </Link>
                    <ScraperStatusBadge status={scraper.status} />
                    <ScraperHealthBadge
                      health={scraper.health_status}
                      score={scraper.health_score}
                    />
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-gray-600">
                    <span className="truncate max-w-xs">{scraper.base_url}</span>
                    <span>{getWorkflowCount(scraper)} steps</span>
                    <span>{getSelectorCount(scraper)} selectors</span>
                    {scraper.last_test_at && (
                      <span>
                        Last tested: {format(new Date(scraper.last_test_at), 'MMM d, h:mm a')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/scrapers/${scraper.id}`}>
                      <Edit className="mr-1 h-3 w-3" />
                      Edit
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/scrapers/${scraper.id}/test`}>
                      <Play className="mr-1 h-3 w-3" />
                      Test
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
                        <Link href={`/admin/scrapers/${scraper.id}`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Config
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(scraper)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={scraper.base_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Visit Site
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => setDeleteTarget(scraper)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Scraper</DialogTitle>
            <DialogDescription>
              Create a new scraper configuration. You can configure the workflow steps after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Internal Name *</Label>
              <Input
                id="name"
                placeholder="e.g., amazon, chewy, petsmart"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <p className="text-xs text-gray-600">
                Used in code and API. Lowercase, no spaces.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="e.g., Amazon, Chewy, PetSmart"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Base URL *</Label>
              <Input
                id="baseUrl"
                type="url"
                placeholder="https://www.example.com"
                value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending ? 'Creating...' : 'Create Scraper'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Scraper</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.display_name || deleteTarget?.name}&quot;?
              This action cannot be undone.
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
