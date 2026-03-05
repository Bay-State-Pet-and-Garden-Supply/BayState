import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface QualityMetrics {
  totalProducts: number;
  productsWithIssues: number;
  issueRate: number;
  completenessDistribution: {
    range: string;
    count: number;
    percentage: number;
  }[];
  issueBreakdown: {
    field: string;
    severity: 'required' | 'recommended';
    count: number;
    percentage: number;
  }[];
  byPipelineStatus: {
    status: string;
    total: number;
    withIssues: number;
  }[];
  recentlyUpdated: number;
}

const QUALITY_FIELDS = [
  { field: 'name', path: 'name', severity: 'required' as const, checkAllCaps: true },
  { field: 'price', path: 'price', severity: 'required' as const },
  { field: 'description', path: 'description', severity: 'recommended' as const },
  { field: 'images', path: 'images', severity: 'recommended' as const, isArray: true },
  { field: 'brand_id', path: 'brand_id', severity: 'recommended' as const },
];

function calculateCompleteness(consolidated: Record<string, unknown> | null): number {
  if (!consolidated) return 0;
  
  let completed = 0;
  const total = QUALITY_FIELDS.length;
  
  for (const { field, checkAllCaps, isArray } of QUALITY_FIELDS) {
    const value = consolidated[field];
    
    if (field === 'name' && checkAllCaps) {
      if (value && typeof value === 'string' && value !== value.toUpperCase()) {
        completed++;
      }
    } else if (field === 'price') {
      if (value && typeof value === 'number' && value > 0) {
        completed++;
      }
    } else if (isArray) {
      if (Array.isArray(value) && value.length > 0) {
        completed++;
      }
    } else {
      if (value) {
        completed++;
      }
    }
  }
  
  return Math.round((completed / total) * 100);
}

function hasIssue(consolidated: Record<string, unknown> | null, field: string): boolean {
  if (!consolidated) return true;
  
  const value = consolidated[field];
  
  if (field === 'name') {
    return !value || (typeof value === 'string' && value === value.toUpperCase());
  }
  if (field === 'price') {
    return !value || (typeof value === 'number' && value <= 0);
  }
  if (field === 'images') {
    return !Array.isArray(value) || value.length === 0;
  }
  return !value;
}

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: products, error } = await supabase
      .from('products_ingestion')
      .select('sku, consolidated, pipeline_status, updated_at');
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    const allProducts = products || [];
    const totalProducts = allProducts.length;
    
    const completenessScores = allProducts.map(p => ({
      product: p,
      completeness: calculateCompleteness(p.consolidated as Record<string, unknown>),
    }));
    
    const productsWithIssues = completenessScores.filter(p => p.completeness < 100).length;
    
    const completenessDistribution = [
      { range: '0-25%', min: 0, max: 25 },
      { range: '26-50%', min: 26, max: 50 },
      { range: '51-75%', min: 51, max: 75 },
      { range: '76-99%', min: 76, max: 99 },
      { range: '100%', min: 100, max: 100 },
    ].map(({ range, min, max }) => {
      const count = completenessScores.filter(p => p.completeness >= min && p.completeness <= max).length;
      return {
        range,
        count,
        percentage: totalProducts > 0 ? Math.round((count / totalProducts) * 100) : 0,
      };
    });
    
    const issueBreakdown = QUALITY_FIELDS.map(({ field, severity }) => {
      const count = allProducts.filter(p => hasIssue(p.consolidated as Record<string, unknown>, field)).length;
      return {
        field,
        severity,
        count,
        percentage: totalProducts > 0 ? Math.round((count / totalProducts) * 100) : 0,
      };
    }).sort((a, b) => b.count - a.count);
    
    const statusGroups = allProducts.reduce((acc, p) => {
      const status = p.pipeline_status || 'unknown';
      if (!acc[status]) {
        acc[status] = { total: 0, withIssues: 0 };
      }
      acc[status].total++;
      const completeness = calculateCompleteness(p.consolidated as Record<string, unknown>);
      if (completeness < 100) {
        acc[status].withIssues++;
      }
      return acc;
    }, {} as Record<string, { total: number; withIssues: number }>);
    
    const byPipelineStatus = Object.entries(statusGroups).map(([status, data]) => ({
      status,
      ...data,
    }));
    
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const recentlyUpdated = allProducts.filter(p => 
      p.updated_at && new Date(p.updated_at) > oneDayAgo
    ).length;
    
    const metrics: QualityMetrics = {
      totalProducts,
      productsWithIssues,
      issueRate: totalProducts > 0 ? Math.round((productsWithIssues / totalProducts) * 100) : 0,
      completenessDistribution,
      issueBreakdown,
      byPipelineStatus,
      recentlyUpdated,
    };
    
    return NextResponse.json(metrics);
  } catch (err) {
    console.error('Quality metrics error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch quality metrics' },
      { status: 500 }
    );
  }
}
