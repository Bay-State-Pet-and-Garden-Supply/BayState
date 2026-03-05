'use client';

import { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Minus, 
  ChevronDown, 
  ChevronUp,
  ExternalLink,
  Search,
  Filter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface SelectorResult {
  id: string;
  selector_name: string;
  selector_value: string;
  status: 'FOUND' | 'MISSING' | 'ERROR' | 'SKIPPED';
  count?: number;
  error_message?: string | null;
  duration_ms?: number | null;
  sku: string;
  required?: boolean;
}

interface SelectorValidationProps {
  testRunId: string;
  configId?: string;
  configSelectors?: ConfigSelector[];
}

interface ConfigSelector {
  name: string;
  selector: string;
  attribute?: string;
  required?: boolean;
}

interface SelectorValidationData {
  selectors: SelectorResult[];
  summary: {
    total: number;
    found: number;
    missing: number;
    error: number;
    skipped: number;
    requiredFailed: number;
  };
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'FOUND':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'MISSING':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'ERROR':
      return <AlertCircle className="h-5 w-5 text-orange-500" />;
    case 'SKIPPED':
      return <Minus className="h-5 w-5 text-gray-400" />;
    default:
      return <AlertCircle className="h-5 w-5 text-gray-400" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'FOUND':
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Found</Badge>;
    case 'MISSING':
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Missing</Badge>;
    case 'ERROR':
      return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Error</Badge>;
    case 'SKIPPED':
      return <Badge variant="secondary">Skipped</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function SelectorValidation({ 
  testRunId, 
  configId,
  configSelectors = []
}: SelectorValidationProps) {
  const [data, setData] = useState<SelectorValidationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSelector, setExpandedSelector] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRequiredOnly, setShowRequiredOnly] = useState(false);

  useEffect(() => {
    async function fetchSelectorResults() {
      try {
        setLoading(true);
        const response = await fetch(`/api/admin/scrapers/studio/test/${testRunId}/selectors`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch selector results: ${response.statusText}`);
        }
        
        const result = await response.json();

        const mergedSelectors = result.selectors.map((sel: SelectorResult) => {
          const configSel = configSelectors.find(cs => cs.name === sel.selector_name);
          return {
            ...sel,
            required: configSel?.required ?? false
          };
        });

        const summary = {
          total: mergedSelectors.length,
          found: mergedSelectors.filter((s: SelectorResult) => s.status === 'FOUND').length,
          missing: mergedSelectors.filter((s: SelectorResult) => s.status === 'MISSING').length,
          error: mergedSelectors.filter((s: SelectorResult) => s.status === 'ERROR').length,
          skipped: mergedSelectors.filter((s: SelectorResult) => s.status === 'SKIPPED').length,
          requiredFailed: mergedSelectors.filter((s: SelectorResult) => 
            s.required && (s.status === 'MISSING' || s.status === 'ERROR')
          ).length,
        };
        
        setData({
          selectors: mergedSelectors,
          summary
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load selector results');
      } finally {
        setLoading(false);
      }
    }

    if (testRunId) {
      fetchSelectorResults();
    }
  }, [testRunId, configSelectors]);

  const toggleExpand = (selectorId: string) => {
    setExpandedSelector(expandedSelector === selectorId ? null : selectorId);
  };

  const filteredSelectors = data?.selectors.filter(selector => {
    if (filterStatus && selector.status !== filterStatus) return false;
    if (showRequiredOnly && !selector.required) return false;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        selector.selector_name.toLowerCase().includes(query) ||
        selector.selector_value.toLowerCase().includes(query)
      );
    }
    
    return true;
  }) || [];

  const groupedSelectors = filteredSelectors.reduce((acc, selector) => {
    if (!acc[selector.status]) acc[selector.status] = [];
    acc[selector.status].push(selector);
    return acc;
  }, {} as Record<string, SelectorResult[]>);

  const statusOrder = ['ERROR', 'MISSING', 'SKIPPED', 'FOUND'];

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Selector Validation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Selector Validation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.selectors.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Selector Validation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No selector validation data available</p>
            <p className="text-sm mt-1">Run a test to see selector results</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className={cn(data.summary.requiredFailed > 0 && "border-red-300 bg-red-50")}>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{data.summary.total}</div>
            <div className="text-sm text-gray-500">Total</div>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{data.summary.found}</div>
            <div className="text-sm text-gray-500">Found</div>
          </CardContent>
        </Card>
        <Card className={cn(data.summary.missing > 0 ? "border-red-200" : "border-gray-200")}>
          <CardContent className="p-4">
            <div className={cn(
              "text-2xl font-bold",
              data.summary.missing > 0 ? "text-red-600" : "text-gray-600"
            )}>
              {data.summary.missing}
            </div>
            <div className="text-sm text-gray-500">Missing</div>
          </CardContent>
        </Card>
        <Card className={cn(data.summary.error > 0 ? "border-orange-200" : "border-gray-200")}>
          <CardContent className="p-4">
            <div className={cn(
              "text-2xl font-bold",
              data.summary.error > 0 ? "text-orange-600" : "text-gray-600"
            )}>
              {data.summary.error}
            </div>
            <div className="text-sm text-gray-500">Errors</div>
          </CardContent>
        </Card>
        <Card className={cn(data.summary.requiredFailed > 0 && "border-red-300 bg-red-50")}>
          <CardContent className="p-4">
            <div className={cn(
              "text-2xl font-bold",
              data.summary.requiredFailed > 0 ? "text-red-600" : "text-gray-600"
            )}>
              {data.summary.requiredFailed}
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-1">
              Required Failed
              {data.summary.requiredFailed > 0 && (
                <AlertCircle className="h-3 w-3 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search selectors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterStatus === null ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(null)}
              >
                All
              </Button>
              <Button
                variant={filterStatus === 'FOUND' ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus('FOUND')}
                className="border-green-200 hover:bg-green-50"
              >
                Found
              </Button>
              <Button
                variant={filterStatus === 'MISSING' ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus('MISSING')}
                className="border-red-200 hover:bg-red-50"
              >
                Missing
              </Button>
              <Button
                variant={filterStatus === 'ERROR' ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus('ERROR')}
                className="border-orange-200 hover:bg-orange-50"
              >
                Errors
              </Button>
              <Button
                variant={showRequiredOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowRequiredOnly(!showRequiredOnly)}
              >
                Required Only
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {data.summary.requiredFailed > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-700">
              {data.summary.requiredFailed} required selector{data.summary.requiredFailed !== 1 ? 's' : ''} failed
            </p>
            <p className="text-sm text-red-600 mt-1">
              Required selectors that were not found or had errors. This may cause the scraper to fail.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Selector Results</span>
            <span className="text-sm font-normal text-gray-500">
              {filteredSelectors.length} of {data.selectors.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredSelectors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Filter className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No selectors match the current filters</p>
            </div>
          ) : (
            statusOrder.map(status => {
              const selectors = groupedSelectors[status];
              if (!selectors || selectors.length === 0) return null;
              
              return (
                <div key={status} className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                    {status} ({selectors.length})
                  </h4>
                  {selectors.map((selector) => (
                    <div
                      key={selector.id}
                      className={cn(
                        "border rounded-lg overflow-hidden transition-colors",
                        selector.required && (selector.status === 'MISSING' || selector.status === 'ERROR')
                          ? "border-red-300 bg-red-50/50"
                          : "border-gray-200",
                        selector.status === 'FOUND' && "border-green-200"
                      )}
                    >
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(selector.status)}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{selector.selector_name}</span>
                                {selector.required && (
                                  <Badge variant="outline" className="text-xs">
                                    Required
                                  </Badge>
                                )}
                                {selector.required && (selector.status === 'MISSING' || selector.status === 'ERROR') && (
                                  <Badge className="bg-red-100 text-red-700 text-xs">
                                    Critical
                                  </Badge>
                                )}
                              </div>
                              <code className="text-xs text-gray-500 block mt-1">
                                {selector.selector_value}
                              </code>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {selector.count !== undefined && selector.count > 0 && (
                              <Badge variant="secondary" className="font-mono">
                                {selector.count} element{selector.count !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {getStatusBadge(selector.status)}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleExpand(selector.id)}
                              className="h-8 w-8 p-0"
                            >
                              {expandedSelector === selector.id ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {expandedSelector === selector.id && (
                          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500">SKU:</span>{' '}
                                <span className="font-mono">{selector.sku}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Duration:</span>{' '}
                                <span>{formatDuration(selector.duration_ms)}</span>
                              </div>
                            </div>

                            {selector.error_message && (
                              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <p className="text-sm font-medium text-red-700">Error</p>
                                    <p className="text-sm text-red-600 mt-1">
                                      {selector.error_message}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {configId && (
                              <div className="flex justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                >
                                  <a 
                                    href={`/admin/scrapers/studio?config=${configId}&tab=selectors`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    View in Config
                                  </a>
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SelectorValidation;
