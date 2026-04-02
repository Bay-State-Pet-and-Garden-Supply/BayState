'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  DollarSign,
  Brain,
  Server,
  CreditCard,
  Mail,
  GitBranch,
  Cloud,
  Pencil,
  Check,
  X,
  TrendingUp,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DataTable, Column } from '@/components/admin/data-table';

interface ServiceCost {
  id: string;
  service: string;
  display_name: string;
  monthly_cost: number;
  billing_cycle: string;
  category: string;
  notes: string | null;
  is_active: boolean;
}

interface BatchJob {
  id: string;
  status: string;
  estimated_cost: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  created_at: string;
  completed_at: string | null;
  description: string | null;
}

interface CostData {
  dateRange: { start: string; end: string; days: number };
  fixedMonthlyTotal: number;
  services: ServiceCost[];
  servicesByCategory: Record<string, ServiceCost[]>;
  ai: {
    consolidation: {
      totalCost: number;
      totalJobs: number;
      completedJobs: number;
      failedJobs: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    recentJobs: BatchJob[];
  };
  estimatedMonthlyTotal: number;
}

const SERVICE_ICONS: Record<string, React.ElementType> = {
  supabase: Server,
  vercel: Cloud,
  openai: Brain,
  resend: Mail,
  github: GitBranch,
  stripe: CreditCard,
};

const CATEGORY_LABELS: Record<string, string> = {
  infrastructure: 'Infrastructure',
  ai: 'AI & Machine Learning',
  payment: 'Payment Processing',
  communication: 'Communication',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  infrastructure: 'text-blue-400',
  ai: 'text-purple-400',
  payment: 'text-green-400',
  communication: 'text-amber-400',
  other: 'text-gray-400',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    completed: 'bg-green-500/10 text-green-400 border-green-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20',
    in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    cancelled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  };

  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-medium', variants[status] ?? variants.pending)}
    >
      {status}
    </Badge>
  );
}

const batchJobColumns: Column<BatchJob>[] = [
  {
    key: 'created_at',
    header: 'Date',
    sortable: true,
    render: (_, row) => (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDate(row.created_at)}
      </span>
    ),
  },
  {
    key: 'description',
    header: 'Description',
    searchable: true,
    render: (_, row) => (
      <span className="text-xs truncate max-w-[200px] block">
        {row.description ?? '—'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (_, row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'total_tokens',
    header: 'Tokens',
    sortable: true,
    className: 'text-right',
    render: (_, row) => (
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatTokens(row.total_tokens ?? 0)}
      </span>
    ),
  },
  {
    key: 'estimated_cost',
    header: 'Cost',
    sortable: true,
    className: 'text-right',
    render: (_, row) => (
      <span className="text-xs tabular-nums font-medium">
        {formatCurrency(parseFloat(String(row.estimated_cost ?? 0)))}
      </span>
    ),
  },
];

function EditableCostCell({
  service,
  onSave,
}: {
  service: ServiceCost;
  onSave: (id: string, cost: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(service.monthly_cost));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) return;
    setSaving(true);
    try {
      await onSave(service.id, parsed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(String(service.monthly_cost));
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">$</span>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          className="h-7 w-24 text-sm"
          autoFocus
          disabled={saving}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={handleSave}
          disabled={saving}
        >
          <Check className="h-3 w-3 text-green-400" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={handleCancel}
          disabled={saving}
        >
          <X className="h-3 w-3 text-red-400" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
    >
      <span className="font-semibold tabular-nums">
        {formatCurrency(service.monthly_cost)}
      </span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity" />
    </button>
  );
}

export function CostTrackingDashboard() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/costs?days=${days}`);
      if (!res.ok) throw new Error('Failed to fetch cost data');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdateCost = async (id: string, cost: number) => {
    const res = await fetch('/api/admin/costs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, monthly_cost: cost }),
    });
    if (!res.ok) throw new Error('Failed to update');
    await fetchData();
  };

  if (loading) {
    return <CostTrackingSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-400 text-sm">{error ?? 'No data available'}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={fetchData}>
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const categories = Object.entries(data.servicesByCategory);

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* Period Selector */}
      <div className="flex items-center gap-2">
        {[7, 30, 90].map((d) => (
          <Button
            key={d}
            variant={days === d ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDays(d)}
          >
            {d}d
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={fetchData} className="ml-auto">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Estimated Monthly"
          value={formatCurrency(data.estimatedMonthlyTotal)}
          icon={DollarSign}
          description="Fixed + usage-based"
          accent="text-green-400"
          bgAccent="bg-green-500/10"
        />
        <SummaryCard
          title="Fixed Services"
          value={formatCurrency(data.fixedMonthlyTotal)}
          icon={Server}
          description={`${data.services.length} active services`}
          accent="text-blue-400"
          bgAccent="bg-blue-500/10"
        />
        <SummaryCard
          title={`AI Costs (${days}d)`}
          value={formatCurrency(data.ai.consolidation.totalCost)}
          icon={Brain}
          description={`${data.ai.consolidation.totalJobs} batch jobs`}
          accent="text-purple-400"
          bgAccent="bg-purple-500/10"
        />
        <SummaryCard
          title="Tokens Used"
          value={formatTokens(data.ai.consolidation.totalTokens)}
          icon={Zap}
          description={`${formatTokens(data.ai.consolidation.promptTokens)} in · ${formatTokens(data.ai.consolidation.completionTokens)} out`}
          accent="text-amber-400"
          bgAccent="bg-amber-500/10"
        />
      </div>

      {/* Service Costs by Category */}
      <div className="grid gap-6 lg:grid-cols-2">
        {categories.map(([category, services]) => (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className={CATEGORY_COLORS[category]}>●</span>
                {CATEGORY_LABELS[category] ?? category}
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {(services ?? []).length} service{(services ?? []).length !== 1 ? 's' : ''}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(services ?? []).map((svc) => {
                const Icon = SERVICE_ICONS[svc.service] ?? Server;
                return (
                  <div
                    key={svc.id}
                    className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 rounded-md bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{svc.display_name}</p>
                        {svc.notes && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                            {svc.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <EditableCostCell service={svc} onSave={handleUpdateCost} />
                      <Badge variant="outline" className="text-[10px]">
                        /{svc.billing_cycle === 'annual' ? 'yr' : 'mo'}
                      </Badge>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-between pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground font-medium">Category Total</span>
                <span className="text-sm font-bold">
                  {formatCurrency(
                    (services ?? []).reduce(
                      (sum, svc) => sum + parseFloat(String(svc.monthly_cost)),
                      0
                    )
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent AI Batch Jobs */}
      {data.ai.recentJobs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-400" />
              Recent AI Consolidation Jobs
              <Badge variant="outline" className="ml-auto text-[10px]">
                Last {days} days
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              data={data.ai.recentJobs}
              columns={batchJobColumns}
              pageSize={10}
              emptyMessage="No recent AI consolidation jobs."
            />
          </CardContent>
        </Card>
      )}

      {/* Footer Note */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        Fixed costs are manually entered estimates. AI costs are tracked automatically from batch jobs.
        Click any cost value to update it.
      </p>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
        <TrendingUp className="h-8 w-8 text-green-400" />
        Cost Tracking
      </h1>
      <p className="text-muted-foreground text-sm">
        Monitor and manage monthly costs across all services and AI usage.
      </p>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  description,
  accent,
  bgAccent,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  description: string;
  accent: string;
  bgAccent: string;
}) {
  return (
    <Card className="py-4 overflow-hidden relative">
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
          <div className={cn('p-2 rounded-full', bgAccent)}>
            <Icon className={cn('h-4 w-4', accent)} />
          </div>
        </div>
        <h3 className="text-2xl font-bold tracking-tight mt-1">{value}</h3>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function CostTrackingSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeader />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="py-4">
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
