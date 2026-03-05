'use client';

import { useState } from 'react';
import { 
  ColumnDef, 
  flexRender, 
  getCoreRowModel, 
  getPaginationRowModel, 
  getSortedRowModel, 
  getFilteredRowModel, 
  useReactTable, 
  SortingState, 
  ColumnFiltersState 
} from '@tanstack/react-table';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowUpDown, 
  Search, 
  MoreHorizontal, 
  Play, 
  Edit, 
  History,
  AlertCircle,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ScraperConfig } from './ConfigList';

interface ConfigListClientProps {
  initialData: ScraperConfig[];
}

export function ConfigListClient({ initialData }: ConfigListClientProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState({});

  const columns: ColumnDef<ScraperConfig>[] = [
    {
      accessorKey: 'display_name',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.getValue('display_name')}</span>
          <span className="text-xs text-muted-foreground">{row.original.slug}</span>
        </div>
      ),
    },
    {
      accessorKey: 'domain',
      header: 'Domain',
      cell: ({ row }) => <div className="text-sm">{row.getValue('domain') || '-'}</div>,
    },
    {
      accessorKey: 'version_count',
      header: 'Versions',
      cell: ({ row }) => (
        <Badge variant="secondary" className="font-mono text-xs">
          v{row.getValue('version_count')}
        </Badge>
      ),
    },
    {
      accessorKey: 'health_status',
      header: 'Health',
      cell: ({ row }) => {
        const status = row.getValue('health_status') as string;
        const score = row.original.health_score;
        
        return (
          <div className="flex items-center gap-2">
            {status === 'healthy' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {status === 'degraded' && <AlertCircle className="h-4 w-4 text-yellow-500" />}
            {status === 'broken' && <XCircle className="h-4 w-4 text-red-500" />}
            {status === 'unknown' && <AlertCircle className="h-4 w-4 text-gray-400" />}
            <span className={cn(
              "text-sm font-medium",
              status === 'healthy' && "text-green-600",
              status === 'degraded' && "text-yellow-600",
              status === 'broken' && "text-red-600"
            )}>
              {score > 0 ? `${score}%` : 'N/A'}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'updated_at',
      header: 'Last Updated',
      cell: ({ row }) => {
        const date = new Date(row.getValue('updated_at'));
        return <div className="text-xs text-muted-foreground">{date.toLocaleDateString()}</div>;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const config = row.original;
 
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={`/admin/scrapers/configs/${config.id}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Configuration
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/admin/scrapers/test-lab/${config.id}`}>
                  <Play className="mr-2 h-4 w-4" />
                  Run Test
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/admin/scrapers/configs/${config.id}/history`}>
                  <History className="mr-2 h-4 w-4" />
                  View History
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: initialData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by name..."
            value={(table.getColumn('display_name')?.getFilterValue() as string) ?? ''}
            onChange={(event) =>
              table.getColumn('display_name')?.setFilterValue(event.target.value)
            }
            className="h-8 w-[150px] lg:w-[250px]"
          />
        </div>
        <Button size="sm" asChild>
           <Link href="/admin/scrapers/create">
             New Config
           </Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="text-xs text-muted-foreground">
            {table.getFilteredRowModel().rows.length} configs found
        </div>
        <div className="flex-1 text-sm text-muted-foreground text-center">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
