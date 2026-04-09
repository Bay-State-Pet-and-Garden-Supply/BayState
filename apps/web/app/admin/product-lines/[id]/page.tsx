import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, RefreshCw, Edit, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { validateConsistency, createConsistencyRules } from '@/lib/consolidation/consistency-rules'
import type { ProductSource } from '@/lib/consolidation/types'

interface ProductLineDetailPageProps {
  params: Promise<{ id: string }>
}

interface ProductLineRecord {
  id: string
  name: string
  upc_prefix: string
  description: string | null
  status: 'active' | 'inactive'
  product_count: number
  created_at: string
  updated_at: string
}

interface ProductIngestion {
  id: string
  sku: string
  product_line: string | null
  pipeline_status: string
  sources: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface ConsistencyViolation {
  rule: string
  severity: string
  message: string
  products: string[]
  field?: string
}

export default async function ProductLineDetailPage({ params }: ProductLineDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: productLine, error: productLineError } = await supabase
    .from('product_lines')
    .select('*')
    .eq('id', id)
    .single()

  if (productLineError || !productLine) {
    console.error('[Product Line Detail] Error fetching product line:', productLineError)
    notFound()
  }

  const { data: products, error } = await supabase
    .from('products_ingestion')
    .select('id, sku, product_line, pipeline_status, sources, created_at, updated_at')
    .eq('product_line', productLine.name)
    .order('sku', { ascending: true })

  if (error) {
    console.error('[Product Line Detail] Error fetching products:', error)
    notFound()
  }

  const productCount = products?.length || 0

  const statusCounts = (products || []).reduce((acc, product) => {
    acc[product.pipeline_status] = (acc[product.pipeline_status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const productSources: ProductSource[] = (products || [])
    .filter((p): p is ProductIngestion & { sources: Record<string, unknown> } => 
      p.sources !== null && typeof p.sources === 'object'
    )
    .map((product) => ({
      sku: product.sku,
      sources: product.sources,
    }))

  const consistencyRules = createConsistencyRules()
  const violations = productSources.length > 1 
    ? validateConsistency(productSources, consistencyRules)
    : []

  const violationsBySeverity = violations.reduce((acc, violation) => {
    const severity = violation.severity
    if (!acc[severity]) acc[severity] = []
    acc[severity].push(violation)
    return acc
  }, {} as Record<string, ConsistencyViolation[]>)

  return (
    <div className="container mx-auto py-8">
      <Button variant="ghost" asChild className="mb-6">
        <Link href="/admin/product-lines">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Product Lines
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{productLine.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {productLine.description || `${productCount} product${productCount !== 1 ? 's' : ''} in this product line`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {violations.length === 0 ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Consistent
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle className="mr-1 h-3 w-3" />
                      {violations.length} Issue{violations.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium">UPC Prefix</h3>
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{productLine.upc_prefix}</code>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium">Status</h3>
                    <Badge variant={productLine.status === 'active' ? 'default' : 'secondary'}>
                      {productLine.status.charAt(0).toUpperCase() + productLine.status.slice(1)}
                    </Badge>
                  </div>
                </div>
                <h3 className="text-sm font-medium mb-3">Pipeline Status Distribution</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <Badge key={status} variant="outline">
                      {status}: {count}
                    </Badge>
                  ))}
                </div>
              </div>

              {violations.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-3">Consistency Issues</h3>
                  <div className="space-y-3">
                    {violationsBySeverity.error && violationsBySeverity.error.length > 0 && (
                      <div className="space-y-2">
                        {violationsBySeverity.error.map((violation) => (
                          <div key={`${violation.rule}-${violation.field || 'general'}`} className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-red-900">{violation.message}</p>
                              <p className="text-xs text-red-700 mt-1">
                                Affected SKUs: {violation.products.join(', ')}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {violationsBySeverity.warning && violationsBySeverity.warning.length > 0 && (
                      <div className="space-y-2">
                        {violationsBySeverity.warning.map((violation) => (
                          <div key={`${violation.rule}-${violation.field || 'general'}`} className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-yellow-900">{violation.message}</p>
                              <p className="text-xs text-yellow-700 mt-1">
                                Affected SKUs: {violation.products.join(', ')}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-2">
                <Button>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reprocess All
                </Button>
                <Button variant="outline">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Product Line
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Products in Line</CardTitle>
              <CardDescription>
                {productCount} product{productCount !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[600px] overflow-y-auto space-y-2">
                {(products || []).map((product) => {
                  const productViolations = violations.filter(v => v.products.includes(product.sku))
                  const hasErrors = productViolations.some(v => v.severity === 'error')
                  const hasWarnings = productViolations.some(v => v.severity === 'warning')
                  
                  return (
                    <Link
                      key={product.id}
                      href={`/admin/products/${product.id}`}
                      className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-md group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{product.sku}</span>
                          {hasErrors && (
                            <AlertCircle className="h-3 w-3 text-red-600 flex-shrink-0" />
                          )}
                          {hasWarnings && !hasErrors && (
                            <AlertTriangle className="h-3 w-3 text-yellow-600 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {product.pipeline_status}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}