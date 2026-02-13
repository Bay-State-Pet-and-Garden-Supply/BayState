'use client';

import { useState, useMemo, useCallback, useTransition, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  Loader2,
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
  totalCount: number;
  currentPage: number;
  pageSize: number;
  initialFilter?: string;
  onEdit: (config: ScraperConfig) => void;
  onPageChange?: (page: number) => void;
  onFilterChange?: (filter: string) => void;
}

const FILTER_DEBOUNCE_MS = 300;

export function StudioConfigListClient({ 
  initialData, 
  totalCount,
  currentPage,
  pageSize,
  initialFilter = '',
  onEdit,
  onPageChange,
  onFilterChange,
}: StudioConfigListClientProps) {
  const [filterText, setFilterText] = useState(initialFilter);
  const [isPending, startTransition] = useTransition();
  const filterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.ceil(totalCount / pageSize);

  const handleFilterChange = useCallback((value: string) => {
    setFilterText(value);
    
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }
    
    const timeout = setTimeout(() => {
      startTransition(() => {
        onFilterChange?.(value);
      });
    }, FILTER_DEBOUNCE_MS);
    
    filterTimeoutRef.current = timeout;
  }, [onFilterChange]);

  useEffect(() => {
    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current);
      }
    };
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    startTransition(() => {
      onPageChange?.(newPage);
    });
  }, [onPageChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by name..."
            value={filterText}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="h-8 w-[250px]"
            disabled={isPending}
          />
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="text-xs text-muted-foreground">
          {totalCount} total configs
          {filterText && ` (filtered from ${totalCount})`}
        </div>
      </div>

      <div className="rounded-md border relative">
        {isPending && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
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
            {initialData.length > 0 ? (
              initialData.map((config) => (
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
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 0 || isPending}
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
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages - 1 || isPending}
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
