'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  ExternalLink, 
  Wand2,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { titleCaseProductName, bulkTitleCaseNames } from '@/app/admin/quality/actions';

interface ProductIssue {
  sku: string;
  name: string | null;
  completeness: number;
  issues: { field: string; severity: 'required' | 'recommended'; message: string }[];
  pipeline_status: string;
}

interface QualityIssueTableProps {
  initialProducts?: ProductIssue[];
}

const ITEMS_PER_PAGE = 20;

export function QualityIssueTable({ initialProducts }: QualityIssueTableProps) {
  const [products, setProducts] = useState<ProductIssue[]>(initialProducts || []);
  const [loading, setLoading] = useState(!initialProducts);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'required' | 'recommended'>('all');
  const [fixing, setFixing] = useState<string | null>(null);
  const [bulkFixing, setBulkFixing] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/quality/products');
      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
      }
    } catch {
      console.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialProducts) {
      fetchProducts();
    }
  }, [initialProducts, fetchProducts]);

  const filteredProducts = products.filter((p) => {
    const matchesSearch = 
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.name?.toLowerCase().includes(search.toLowerCase()) ?? false);
    
    if (!matchesSearch) return false;
    
    if (filter === 'all') return true;
    return p.issues.some((i) => i.severity === filter);
  });

  const paginatedProducts = filteredProducts.slice(
    page * ITEMS_PER_PAGE,
    (page + 1) * ITEMS_PER_PAGE
  );

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);

  const handleQuickFix = async (sku: string) => {
    setFixing(sku);
    try {
      const result = await titleCaseProductName(sku);
      if (result.success) {
        toast.success('Product name fixed');
        fetchProducts();
      } else {
        toast.error(result.error || 'Failed to fix');
      }
    } catch {
      toast.error('Failed to fix product name');
    } finally {
      setFixing(null);
    }
  };

  const handleBulkFix = async () => {
    setBulkFixing(true);
    try {
      const result = await bulkTitleCaseNames();
      if (result.success) {
        toast.success(`Fixed ${result.affectedCount} product names`);
        fetchProducts();
      } else {
        toast.error(result.error || 'Failed to bulk fix');
      }
    } catch {
      toast.error('Failed to bulk fix product names');
    } finally {
      setBulkFixing(false);
    }
  };

  const getCompletenessColor = (completeness: number) => {
    if (completeness >= 100) return 'text-green-600 bg-green-100';
    if (completeness >= 75) return 'text-blue-600 bg-blue-100';
    if (completeness >= 50) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <h2 className="text-lg font-semibold">Products with Issues</h2>
            <Badge variant="warning" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-none">
              {filteredProducts.length}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search SKU or name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-9"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as 'all' | 'required' | 'recommended');
                setPage(0);
              }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="all">All Issues</option>
              <option value="required">Required Only</option>
              <option value="recommended">Recommended Only</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkFix}
              disabled={bulkFixing}
            >
              <Wand2 className="mr-2 h-4 w-4" />
              {bulkFixing ? 'Fixing...' : 'Fix All Names'}
            </Button>
          </div>
        </div>
      </div>

      <div className="divide-y">
        {paginatedProducts.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <p className="mt-2 text-lg font-medium text-green-700">All products look good!</p>
            <p className="text-muted-foreground">No issues found with the current filter.</p>
          </div>
        ) : (
          paginatedProducts.map((product) => (
            <div key={product.sku} className="flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    {product.sku}
                  </span>
                  {product.pipeline_status === 'published' ? (
                    <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-none capitalize">
                      {product.pipeline_status}
                    </Badge>
                  ) : product.pipeline_status === 'approved' ? (
                    <Badge variant="success" className="bg-green-100 text-green-700 hover:bg-green-200 border-none capitalize">
                      {product.pipeline_status}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-gray-100 text-gray-700 hover:bg-gray-200 border-none capitalize">
                      {product.pipeline_status}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate font-medium">
                  {product.name || <span className="italic text-muted-foreground">No name</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {product.issues.slice(0, 3).map((issue) => (
                    <Badge
                      key={issue.field}
                      variant={issue.severity === 'required' ? 'destructive' : 'warning'}
                      className={`
                        ${issue.severity === 'required' 
                          ? 'bg-red-100 text-red-700 hover:bg-red-200 border-none' 
                          : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-none'
                        }
                      `}
                    >
                      {issue.message}
                    </Badge>
                  ))}
                  {product.issues.length > 3 && (
                    <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200">
                      +{product.issues.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <Badge 
                    className={`
                      ${product.completeness >= 100 ? 'text-green-600 bg-green-100 hover:bg-green-200' : 
                        product.completeness >= 75 ? 'text-blue-600 bg-blue-100 hover:bg-blue-200' :
                        product.completeness >= 50 ? 'text-yellow-600 bg-yellow-100 hover:bg-yellow-200' :
                        'text-red-600 bg-red-100 hover:bg-red-200'
                      } border-none
                    `}
                  >
                    {product.completeness}%
                  </Badge>
                </div>

                <div className="flex gap-1">
                  {product.issues.some((i) => i.field === 'name') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleQuickFix(product.sku)}
                      disabled={fixing === product.sku}
                      title="Fix name casing"
                    >
                      <Wand2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    title="Edit in pipeline"
                  >
                    <a href={`/admin/pipeline?sku=${product.sku}`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t p-4">
          <p className="text-sm text-muted-foreground">
            Showing {page * ITEMS_PER_PAGE + 1} to{' '}
            {Math.min((page + 1) * ITEMS_PER_PAGE, filteredProducts.length)} of{' '}
            {filteredProducts.length}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
