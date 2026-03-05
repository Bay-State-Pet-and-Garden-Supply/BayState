import { type LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  href?: string;
  trend?: {
    value: number;
    label: string;
    isPositive: boolean;
  };
  variant?: 'default' | 'warning' | 'success' | 'info';
}

const variantStyles = {
  default: 'bg-card border-border',
  warning: 'bg-orange-50 border-orange-200',
  success: 'bg-green-50 border-green-200',
  info: 'bg-blue-50 border-blue-200',
};

const iconStyles = {
  default: 'text-muted-foreground',
  warning: 'text-orange-600',
  success: 'text-green-600',
  info: 'text-blue-600',
};

const valueStyles = {
  default: 'text-foreground',
  warning: 'text-orange-700',
  success: 'text-green-700',
  info: 'text-blue-700',
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  href,
  trend,
  variant = 'default',
}: StatCardProps) {
  const content = (
    <div
      className={`rounded-lg border p-4 transition-all ${variantStyles[variant]} ${
        href ? 'hover:shadow-md cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className={`flex items-center gap-2 ${iconStyles[variant]}`}>
            <Icon className="h-5 w-5" />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <p className={`mt-2 text-3xl font-bold ${valueStyles[variant]}`}>
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p
              className={`mt-1 text-sm ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {trend.isPositive ? '+' : ''}
              {trend.value}% {trend.label}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
