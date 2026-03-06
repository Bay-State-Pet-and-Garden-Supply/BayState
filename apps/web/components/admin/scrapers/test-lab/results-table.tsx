'use client';

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Sparkline } from './sparkline';
import { SkuResult } from './results-panel';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock3, 
  Loader2, 
  ChevronRight, 
  ChevronDown 
} from 'lucide-react';

interface ResultsTableProps {
  results: SkuResult[];
  isLoading?: boolean;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'pending':
      return <Clock3 className="h-4 w-4 text-gray-500" />;
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'no_results':
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    default:
      return <XCircle className="h-4 w-4 text-red-600" />;
  }
}

function getSelectorHealth(result: SkuResult): number {
  const selectors = result.telemetry?.selectors ?? [];
  if (selectors.length === 0) return 0;
  const found = selectors.filter((s) => s.status === 'FOUND').length;
  return Math.round((found / selectors.length) * 100);
}

export function ResultsTable({ results, isLoading }: ResultsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (sku: string) => {
    const next = new Set(expandedRows);
    if (next.has(sku)) {
      next.delete(sku);
    } else {
      next.add(sku);
    }
    setExpandedRows(next);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 border rounded-md bg-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-12"></TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Health</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                No results yet. Run a test to populate this table.
              </TableCell>
            </TableRow>
          ) : (
            results.map((result) => {
              const isExpanded = expandedRows.has(result.sku);
              const health = getSelectorHealth(result);
              // Mock data for sparkline based on selector status if available, or just random-ish for visual
              const sparkData = result.telemetry?.selectors?.map(s => s.status === 'FOUND' ? 1 : 0) || [0, 1, 0, 1];

              return (
                <React.Fragment key={result.sku}>
                  <TableRow 
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleRow(result.sku)}
                  >
                    <TableCell>
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">{result.sku}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(result.status)}
                        <span className="capitalize text-xs">{result.status.replace('_', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {result.duration_ms ? `${result.duration_ms}ms` : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Sparkline data={sparkData} color={health > 80 ? '#16a34a' : health > 50 ? '#ca8a04' : '#dc2626'} />
                        <span className="text-[10px] font-medium w-8">{health}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">Details</Badge>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/10">
                      <TableCell colSpan={6} className="p-0">
                        <div className="p-4 border-t space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <section className="space-y-2">
                              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extraction Results</h3>
                              <div className="rounded-md border bg-background overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="h-8 text-[10px]">
                                      <TableHead>Field</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Value</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {result.telemetry?.extractions?.map((ext, i) => (
                                      <TableRow key={i} className="h-8 text-[10px]">
                                        <TableCell className="font-mono">{ext.field_name}</TableCell>
                                        <TableCell>
                                          <Badge variant={ext.status === 'SUCCESS' ? 'default' : 'destructive'} className="h-4 px-1 text-[8px]">
                                            {ext.status}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[150px] truncate">{ext.field_value || '-'}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </section>
                            <section className="space-y-2">
                              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selector Health</h3>
                              <div className="rounded-md border bg-background overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="h-8 text-[10px]">
                                      <TableHead>Selector</TableHead>
                                      <TableHead>Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {result.telemetry?.selectors?.map((sel, i) => (
                                      <TableRow key={i} className="h-8 text-[10px]">
                                        <TableCell className="font-mono">{sel.selector_name}</TableCell>
                                        <TableCell>
                                          <Badge variant={sel.status === 'FOUND' ? 'outline' : 'destructive'} className="h-4 px-1 text-[8px]">
                                            {sel.status}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </section>
                          </div>
                          {result.error && (
                            <div className="text-xs p-2 rounded bg-destructive/10 text-destructive border border-destructive/20">
                              <strong>Error:</strong> {result.error}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
