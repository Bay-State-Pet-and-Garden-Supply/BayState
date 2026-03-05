import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface ProductIssue {
  sku: string;
  name: string | null;
  completeness: number;
  issues: { field: string; severity: 'required' | 'recommended'; message: string }[];
  pipeline_status: string;
}

const QUALITY_RULES = [
  { 
    field: 'name', 
    severity: 'required' as const,
    check: (c: Record<string, unknown>) => {
      const name = c?.name;
      return !name || (typeof name === 'string' && name === name.toUpperCase());
    },
    message: 'Needs clean name',
  },
  {
    field: 'price',
    severity: 'required' as const,
    check: (c: Record<string, unknown>) => !c?.price || (typeof c.price === 'number' && c.price <= 0),
    message: 'Missing price',
  },
  {
    field: 'description',
    severity: 'recommended' as const,
    check: (c: Record<string, unknown>) => !c?.description,
    message: 'Add description',
  },
  {
    field: 'images',
    severity: 'recommended' as const,
    check: (c: Record<string, unknown>) => !Array.isArray(c?.images) || c.images.length === 0,
    message: 'Add images',
  },
  {
    field: 'brand_id',
    severity: 'recommended' as const,
    check: (c: Record<string, unknown>) => !c?.brand_id,
    message: 'Assign brand',
  },
];

function calculateCompleteness(consolidated: Record<string, unknown> | null): number {
  if (!consolidated) return 0;
  
  let completed = 0;
  
  const name = consolidated.name;
  if (name && typeof name === 'string' && name !== name.toUpperCase()) completed++;
  
  const price = consolidated.price;
  if (price && typeof price === 'number' && price > 0) completed++;
  
  if (consolidated.description) completed++;
  if (Array.isArray(consolidated.images) && consolidated.images.length > 0) completed++;
  if (consolidated.brand_id) completed++;
  
  return Math.round((completed / QUALITY_RULES.length) * 100);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const severityFilter = searchParams.get('severity') as 'required' | 'recommended' | null;
    
    const supabase = await createClient();
    
    const { data: products, error } = await supabase
      .from('products_ingestion')
      .select('sku, consolidated, input, pipeline_status')
      .order('updated_at', { ascending: false });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    const productsWithIssues: ProductIssue[] = (products || [])
      .map((p) => {
        const consolidated = (p.consolidated || {}) as Record<string, unknown>;
        const input = (p.input || {}) as Record<string, unknown>;
        
        const issues = QUALITY_RULES
          .filter((rule) => rule.check(consolidated))
          .map((rule) => ({
            field: rule.field,
            severity: rule.severity,
            message: rule.message,
          }));
        
        return {
          sku: p.sku,
          name: (consolidated.name || input.name || null) as string | null,
          completeness: calculateCompleteness(consolidated),
          issues,
          pipeline_status: p.pipeline_status,
        };
      })
      .filter((p) => {
        if (p.issues.length === 0) return false;
        if (severityFilter) {
          return p.issues.some((i) => i.severity === severityFilter);
        }
        return true;
      })
      .sort((a, b) => a.completeness - b.completeness);
    
    return NextResponse.json({ products: productsWithIssues });
  } catch (err) {
    console.error('Products quality error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}
