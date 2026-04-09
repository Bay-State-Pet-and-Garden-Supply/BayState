'use client';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Info,
} from 'lucide-react';

/**
 * Batch status types for cohort/batch processing
 */
export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Batch warning levels
 */
export type WarningLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Status configuration for batch processing
 */
const batchStatusConfig: Record<
  BatchStatus,
  {
    label: string;
    className: string;
    icon: React.ElementType;
    description: string;
  }
> = {
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700',
    icon: Clock,
    description: 'Batch is queued and waiting to start',
  },
  processing: {
    label: 'Processing',
    className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700',
    icon: Loader2,
    description: 'Batch is currently being processed',
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700',
    icon: CheckCircle2,
    description: 'Batch processing completed successfully',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700',
    icon: XCircle,
    description: 'Batch processing failed',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900/30 dark:text-slate-200 dark:border-slate-700',
    icon: XCircle,
    description: 'Batch processing was cancelled',
  },
};

/**
 * Warning level configuration
 */
const warningConfig: Record<
  WarningLevel,
  {
    className: string;
    icon: React.ElementType;
  }
> = {
  none: {
    className: '',
    icon: Info,
  },
  low: {
    className: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-800',
    icon: AlertTriangle,
  },
  medium: {
    className: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-200 dark:border-orange-800',
    icon: AlertTriangle,
  },
  high: {
    className: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800',
    icon: AlertTriangle,
  },
  critical: {
    className: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-100 dark:border-red-700',
    icon: AlertTriangle,
  },
};

/**
 * Props for BatchStatusBadge component
 */
export interface BatchStatusBadgeProps {
  /** Current batch status */
  status: BatchStatus;
  /** Additional CSS classes */
  className?: string;
  /** Show icon alongside text */
  showIcon?: boolean;
  /** Show description tooltip */
  showDescription?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * BatchStatusBadge - Simple status badge for batch processing
 *
 * Displays batch status with optional icon and description.
 * Follows design system color tokens and accessibility guidelines.
 *
 * @example
 * ```tsx
 * <BatchStatusBadge status="processing" showIcon />
 * <BatchStatusBadge status="completed" size="lg" />
 * ```
 */
export function BatchStatusBadge({
  status,
  className,
  showIcon = true,
  showDescription = false,
  size = 'md',
}: BatchStatusBadgeProps) {
  const config = batchStatusConfig[status] || batchStatusConfig.pending;
  const Icon = config.icon;
  const isProcessing = status === 'processing';

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium gap-1.5',
        config.className,
        sizeClasses[size],
        className
      )}
      title={showDescription ? config.description : undefined}
    >
      {showIcon && (
        <Icon
          className={cn(iconSizes[size], isProcessing && 'animate-spin')}
          aria-hidden="true"
        />
      )}
      <span>{config.label}</span>
    </Badge>
  );
}

/**
 * Props for BatchProgressIndicator component
 */
export interface BatchProgressIndicatorProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Current batch status */
  status?: BatchStatus;
  /** Show percentage text */
  showPercentage?: boolean;
  /** Show status badge */
  showStatus?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Progress bar height */
  height?: 'sm' | 'md' | 'lg';
}

/**
 * BatchProgressIndicator - Progress bar with percentage for batch processing
 *
 * Shows visual progress indicator with optional status badge.
 * Uses design system progress component and status colors.
 *
 * @example
 * ```tsx
 * <BatchProgressIndicator progress={75} status="processing" showPercentage />
 * <BatchProgressIndicator progress={100} status="completed" height="lg" />
 * ```
 */
export function BatchProgressIndicator({
  progress,
  status = 'processing',
  showPercentage = true,
  showStatus = false,
  className,
  height = 'md',
}: BatchProgressIndicatorProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  const getProgressColor = () => {
    if (status === 'completed') return 'bg-emerald-500';
    if (status === 'failed') return 'bg-red-500';
    if (status === 'cancelled') return 'bg-slate-400';
    return 'bg-blue-500';
  };

  return (
    <div className={cn('space-y-2', className)}>
      {(showPercentage || showStatus) && (
        <div className="flex items-center justify-between">
          {showStatus && <BatchStatusBadge status={status} size="sm" />}
          {showPercentage && (
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {clampedProgress}%
            </span>
          )}
        </div>
      )}
      <Progress
        value={clampedProgress}
        className={heightClasses[height]}
        indicatorClassName={getProgressColor()}
      />
    </div>
  );
}

/**
 * Props for BatchConsistencyScore component
 */
export interface BatchConsistencyScoreProps {
  /** Consistency score (0-100) */
  score: number;
  /** Show trend indicator */
  showTrend?: boolean;
  /** Trend direction */
  trend?: 'up' | 'down' | 'stable';
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * BatchConsistencyScore - Consistency score display for batch processing
 *
 * Shows consistency score with color-coded quality indicator.
 * Uses design system color tokens for accessibility.
 *
 * @example
 * ```tsx
 * <BatchConsistencyScore score={95} showTrend trend="up" />
 * <BatchConsistencyScore score={72} size="lg" />
 * ```
 */
export function BatchConsistencyScore({
  score,
  showTrend = false,
  trend = 'stable',
  className,
  size = 'md',
}: BatchConsistencyScoreProps) {
  const clampedScore = Math.min(100, Math.max(0, score));

  const getScoreColor = () => {
    if (clampedScore >= 90) return 'text-emerald-600 dark:text-emerald-400';
    if (clampedScore >= 70) return 'text-blue-600 dark:text-blue-400';
    if (clampedScore >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreLabel = () => {
    if (clampedScore >= 90) return 'Excellent';
    if (clampedScore >= 70) return 'Good';
    if (clampedScore >= 50) return 'Fair';
    return 'Poor';
  };

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const getTrendIcon = () => {
    if (trend === 'up') {
      return <TrendingUp className={cn(iconSizes[size], 'text-emerald-500')} />;
    }
    if (trend === 'down') {
      return <TrendingUp className={cn(iconSizes[size], 'text-red-500 rotate-180')} />;
    }
    return null;
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex items-baseline gap-1', sizeClasses[size])}>
        <span className={cn('font-semibold', getScoreColor())}>{clampedScore}%</span>
        <span className="text-slate-500 dark:text-slate-400 text-xs">
          {getScoreLabel()}
        </span>
      </div>
      {showTrend && getTrendIcon()}
    </div>
  );
}

/**
 * Props for BatchWarningBadge component
 */
export interface BatchWarningBadgeProps {
  /** Warning level */
  level: WarningLevel;
  /** Warning message */
  message?: string;
  /** Show icon */
  showIcon?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * BatchWarningBadge - Warning badge for batch processing issues
 *
 * Displays warning level with optional message.
 * Uses design system color tokens for accessibility.
 *
 * @example
 * ```tsx
 * <BatchWarningBadge level="high" message="3 items failed validation" />
 * <BatchWarningBadge level="critical" showIcon />
 * ```
 */
export function BatchWarningBadge({
  level,
  message,
  showIcon = true,
  className,
  size = 'md',
}: BatchWarningBadgeProps) {
  if (level === 'none') return null;

  const config = warningConfig[level];
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  const levelLabels: Record<WarningLevel, string> = {
    none: '',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };

  return (
    <Badge
      variant="outline"
      className={cn('font-medium gap-1.5', config.className, sizeClasses[size], className)}
    >
      {showIcon && <Icon className={iconSizes[size]} aria-hidden="true" />}
      <span>{levelLabels[level]}</span>
      {message && <span className="opacity-80">- {message}</span>}
    </Badge>
  );
}

/**
 * Props for BatchStatusIndicator component (combined)
 */
export interface BatchStatusIndicatorProps {
  /** Current batch status */
  status: BatchStatus;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Consistency score (0-100) */
  consistencyScore?: number;
  /** Warning level */
  warningLevel?: WarningLevel;
  /** Warning message */
  warningMessage?: string;
  /** Show progress bar */
  showProgress?: boolean;
  /** Show consistency score */
  showConsistency?: boolean;
  /** Show warning badge */
  showWarning?: boolean;
  /** Compact layout */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * BatchStatusIndicator - Combined batch status display with all features
 *
 * Comprehensive status indicator combining status badge, progress,
 * consistency score, and warning badge in a unified component.
 *
 * @example
 * ```tsx
 * <BatchStatusIndicator
 *   status="processing"
 *   progress={65}
 *   consistencyScore={92}
 *   showProgress
 *   showConsistency
 * />
 *
 * <BatchStatusIndicator
 *   status="completed"
 *   progress={100}
 *   consistencyScore={88}
 *   warningLevel="low"
 *   warningMessage="2 items skipped"
 *   showWarning
 * />
 * ```
 */
export function BatchStatusIndicator({
  status,
  progress,
  consistencyScore,
  warningLevel = 'none',
  warningMessage,
  showProgress = false,
  showConsistency = false,
  showWarning = false,
  compact = false,
  className,
}: BatchStatusIndicatorProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Status and Warning Row */}
      <div className={cn('flex items-center gap-2', compact ? 'flex-row' : 'flex-wrap')}>
        <BatchStatusBadge status={status} showIcon size={compact ? 'sm' : 'md'} />

        {showWarning && warningLevel !== 'none' && (
          <BatchWarningBadge
            level={warningLevel}
            message={warningMessage}
            size={compact ? 'sm' : 'md'}
          />
        )}
      </div>

      {/* Progress Bar */}
      {showProgress && typeof progress === 'number' && (
        <BatchProgressIndicator
          progress={progress}
          status={status}
          showPercentage
          height={compact ? 'sm' : 'md'}
        />
      )}

      {/* Consistency Score */}
      {showConsistency && typeof consistencyScore === 'number' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Consistency:</span>
          <BatchConsistencyScore score={consistencyScore} size={compact ? 'sm' : 'md'} />
        </div>
      )}
    </div>
  );
}