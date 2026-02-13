'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  MoreHorizontal, 
  Edit,
  History,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ScraperConfig } from '../scrapers/ConfigList';

interface StudioConfigListClientProps {
  initialData: ScraperConfig[];
  onEdit: (config: ScraperConfig) => void;
}

const ITEMS_PER_PAGE = 10;

export function StudioConfigListClient({ initialData, onEdit }: StudioConfigListClientProps) {
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  const filteredConfigs = useMemo(() => {
    if (!filterText) return initialData;
    const lower = filterText.toLowerCase();
    return initialData.filter(
      (c) =>
        c.display_name.toLowerCase().includes(lower) ||
        c.slug.toLowerCase().includes(lower)
    );
  }, [initialData, filterText]);

  const totalPages = Math.ceil(filteredConfigs.length / ITEMS_PER_PAGE);
  const paginatedConfigs = filteredConfigs.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by name..."
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setCurrentPage(0);
            }}
            className="h-8 w-[250px]"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {filteredConfigs.length} configs found
        </div>
      </div>

      <div className="rounded-md border">
        <table className="w-full">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="h-12 px-4 text-left align-middle font-medium">Name</th>
              <th className="h-12 px-4 text-left align-middle font-medium">Domain</th>
              <th className="h-12 px-4 text-left align-middle font-medium">Versions</th>
              <th className="h-12 px-4 text-left align-middle font-medium">Health</th>
              <th className="h-12 px-4 text-left align-middle font-medium">Last Updated</th>
              <th className="h-12 px-4 text-left align-middle font-medium w-12"></th>
            </tr>
          </thead>
          <tbody>
            {paginatedConfigs.length > 0 ? (
              paginatedConfigs.map((config) => (
                <tr key={config.id} className="border-b hover:bg-muted/50">
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="font-medium">{config.display_name}</span>
                      <span className="text-xs text-muted-foreground">{config.slug}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm">{config.domain || '-'}</td>
                  <td className="p-4">
                    <Badge variant="secondary" className="font-mono text-xs">
                      v{config.version_count}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {config.health_status === 'healthy' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {config.health_status === 'degraded' && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                      {config.health_status === 'broken' && <XCircle className="h-4 w-4 text-red-500" />}
                      {config.health_status === 'unknown' && <AlertCircle className="h-4 w-4 text-gray-400" />}
                      <span className={cn(
                        "text-sm font-medium",
                        config.health_status === 'healthy' && "text-green-600",
                        config.health_status === 'degraded' && "text-yellow-600",
                        config.health_status === 'broken' && "text-red-600"
                      )}>
                        {config.health_score > 0 ? `${config.health_score}%` : 'N/A'}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">
                    {new Date(config.updated_at).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => onEdit(config)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Configuration
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled>
                          <History className="mr-2 h-4 w-4" />
                          View History
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="h-24 text-center text-muted-foreground">
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default StudioConfigListClient;
