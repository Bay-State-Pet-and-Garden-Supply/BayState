/**
 * LiveLoginStatus Component
 *
 * Real-time visualization of login flow progress.
 * Shows 4 steps: username field → password field → submit button → success indicator.
 * Each step displays status (FOUND/MISSING/ERROR/PENDING) with duration.
 * Overall status with color-coded badge.
 *
 * @example
 * <LiveLoginStatus
 *   loginEvent={{
 *     username_field_status: 'FOUND',
 *     password_field_status: 'FOUND',
 *     submit_button_status: 'FOUND',
 *     success_indicator_status: 'FOUND',
 *     overall_status: 'SUCCESS',
 *     duration_ms: 1250,
 *     timestamp: '2026-01-30T10:30:00Z'
 *   }}
 * />
 */

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Lock,
  ArrowRightCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type LoginStepStatus = 'FOUND' | 'MISSING' | 'ERROR' | 'PENDING';
export type LoginOverallStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'ERROR';

export interface LoginEvent {
  /** Status of username field detection */
  username_field_status?: LoginStepStatus;
  /** Duration for username field step in milliseconds */
  username_field_duration_ms?: number;
  /** Status of password field detection */
  password_field_status?: LoginStepStatus;
  /** Duration for password field step in milliseconds */
  password_field_duration_ms?: number;
  /** Status of submit button detection */
  submit_button_status?: LoginStepStatus;
  /** Duration for submit button step in milliseconds */
  submit_button_duration_ms?: number;
  /** Status of success indicator detection */
  success_indicator_status?: LoginStepStatus;
  /** Duration for success indicator step in milliseconds */
  success_indicator_duration_ms?: number;
  /** Overall login flow status */
  overall_status: LoginOverallStatus;
  /** Total duration of login flow in milliseconds */
  duration_ms?: number;
  /** Error message if login failed or errored */
  error_message?: string;
  /** ISO timestamp of the event */
  timestamp: string;
}

export interface LiveLoginStatusProps {
  /** Login event data from WebSocket or API */
  loginEvent?: LoginEvent;
  /** Optional CSS class for styling */
  className?: string;
  /** Optional compact mode for smaller displays */
  compact?: boolean;
}

interface LoginStep {
  id: string;
  name: string;
  status: LoginStepStatus;
  icon: React.ElementType;
  description: string;
}

// ============================================================================
// Component
// ============================================================================

export function LiveLoginStatus({
  loginEvent,
  className,
  compact = false,
}: LiveLoginStatusProps) {
  // Build steps array from login event
  const steps: LoginStep[] = useMemo(() => {
    if (!loginEvent) {
      return [
        {
          id: 'username',
          name: 'Username Field',
          status: 'PENDING',
          icon: User,
          description: 'Waiting for detection...',
        },
        {
          id: 'password',
          name: 'Password Field',
          status: 'PENDING',
          icon: Lock,
          description: 'Waiting for detection...',
        },
        {
          id: 'submit',
          name: 'Submit Button',
          status: 'PENDING',
          icon: ArrowRightCircle,
          description: 'Waiting for detection...',
        },
        {
          id: 'success',
          name: 'Success Indicator',
          status: 'PENDING',
          icon: CheckCircle2,
          description: 'Waiting for detection...',
        },
      ];
    }

    return [
      {
        id: 'username',
        name: 'Username Field',
        status: loginEvent.username_field_status || 'PENDING',
        icon: User,
        description: getStepDescription(loginEvent.username_field_status),
      },
      {
        id: 'password',
        name: 'Password Field',
        status: loginEvent.password_field_status || 'PENDING',
        icon: Lock,
        description: getStepDescription(loginEvent.password_field_status),
      },
      {
        id: 'submit',
        name: 'Submit Button',
        status: loginEvent.submit_button_status || 'PENDING',
        icon: ArrowRightCircle,
        description: getStepDescription(loginEvent.submit_button_status),
      },
      {
        id: 'success',
        name: 'Success Indicator',
        status: loginEvent.success_indicator_status || 'PENDING',
        icon: CheckCircle2,
        description: getStepDescription(loginEvent.success_indicator_status),
      },
    ];
  }, [loginEvent]);

  // Get overall status display config
  const overallStatus = useMemo(() => {
    if (!loginEvent) {
      return {
        label: 'Waiting',
        variant: 'secondary' as const,
        color: 'gray',
        icon: Clock,
        message: 'Waiting for login flow to start...',
      };
    }

    const configs: Record<
      LoginOverallStatus,
      {
        label: string;
        variant: 'default' | 'destructive' | 'secondary' | 'outline';
        color: 'green' | 'red' | 'gray' | 'orange';
        icon: React.ElementType;
        message: string;
      }
    > = {
      SUCCESS: {
        label: 'Success',
        variant: 'default',
        color: 'green',
        icon: CheckCircle2,
        message: 'Login completed successfully',
      },
      FAILED: {
        label: 'Failed',
        variant: 'destructive',
        color: 'red',
        icon: XCircle,
        message: loginEvent.error_message || 'Login failed',
      },
      SKIPPED: {
        label: 'Skipped',
        variant: 'secondary',
        color: 'gray',
        icon: Clock,
        message: 'Login skipped (already authenticated)',
      },
      ERROR: {
        label: 'Error',
        variant: 'destructive',
        color: 'orange',
        icon: AlertCircle,
        message: loginEvent.error_message || 'An error occurred during login',
      },
    };

    return configs[loginEvent.overall_status];
  }, [loginEvent]);

  // Calculate completion percentage
  const completionPercent = useMemo(() => {
    if (!loginEvent) return 0;
    const completedSteps = steps.filter(
      (s) => s.status === 'FOUND' || s.status === 'ERROR' || s.status === 'MISSING'
    ).length;
    return (completedSteps / steps.length) * 100;
  }, [steps, loginEvent]);

  const OverallIcon = overallStatus.icon;

  return (
    <Card className={className}>
      <CardHeader className={compact ? 'pb-2' : ''}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <OverallIcon
              className={`h-5 w-5 ${getStatusColorClass(overallStatus.color)}`}
            />
            <CardTitle className={compact ? 'text-base' : 'text-lg'}>
              Login Flow
            </CardTitle>
          </div>
          <Badge variant={overallStatus.variant}>{overallStatus.label}</Badge>
        </div>

        {/* Progress bar */}
        {loginEvent && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getProgressColorClass(
                  overallStatus.color
                )}`}
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className={compact ? 'pt-0' : ''}>
        {/* Status message */}
        <div className="mb-4 text-sm text-muted-foreground">
          {overallStatus.message}
        </div>

        {/* Error message display */}
        {loginEvent?.error_message &&
          (loginEvent.overall_status === 'FAILED' ||
            loginEvent.overall_status === 'ERROR') && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="text-sm text-red-700">
                  {loginEvent.error_message}
                </div>
              </div>
            </div>
          )}

        {/* Login steps */}
        <div className="space-y-2">
          {steps.map((step, index) => (
            <LoginStepRow
              key={step.id}
              step={step}
              index={index}
              isLast={index === steps.length - 1}
              compact={compact}
            />
          ))}
        </div>

        {/* Duration */}
        {loginEvent?.duration_ms !== undefined && (
          <div className="mt-4 flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Duration: {formatDuration(loginEvent.duration_ms)}</span>
          </div>
        )}

        {/* Pending state */}
        {!loginEvent && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Waiting for login validation...</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface LoginStepRowProps {
  step: LoginStep;
  index: number;
  isLast: boolean;
  compact?: boolean;
}

function LoginStepRow({ step, isLast, compact }: LoginStepRowProps) {
  const statusConfig = getStepStatusConfig(step.status);
  const Icon = step.icon;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="relative flex items-start gap-3">
      {/* Connector line */}
      {!isLast && (
        <div
          className={`absolute left-[19px] top-8 h-[calc(100%+8px)] w-px ${
            step.status === 'FOUND'
              ? 'bg-green-300'
              : step.status === 'ERROR' || step.status === 'MISSING'
              ? 'bg-red-300'
              : 'bg-gray-200'
          }`}
        />
      )}

      {/* Step indicator */}
      <div
        className={`relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          compact ? 'h-8 w-8' : 'h-10 w-10'
        } ${statusConfig.borderColor} ${statusConfig.bgColor}`}
      >
        {step.status === 'PENDING' ? (
          <Icon className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-gray-400`} />
        ) : (
          <StatusIcon
            className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${statusConfig.iconColor}`}
          />
        )}
      </div>

      {/* Step content */}
      <div className="flex-1 pt-1">
        <div className="flex items-center justify-between">
          <span
            className={`font-medium ${
              compact ? 'text-sm' : 'text-base'
            } ${statusConfig.textColor}`}
          >
            {step.name}
          </span>
          <Badge
            variant={statusConfig.badgeVariant}
            className={`text-xs ${statusConfig.badgeClass}`}
          >
            {step.status}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getStepDescription(status?: LoginStepStatus): string {
  switch (status) {
    case 'FOUND':
      return 'Element detected successfully';
    case 'MISSING':
      return 'Element not found on page';
    case 'ERROR':
      return 'Error during element detection';
    case 'PENDING':
    default:
      return 'Waiting for detection...';
  }
}

function getStepStatusConfig(status: LoginStepStatus) {
  const configs: Record<
    LoginStepStatus,
    {
      borderColor: string;
      bgColor: string;
      iconColor: string;
      textColor: string;
      badgeVariant: 'default' | 'destructive' | 'secondary' | 'outline';
      badgeClass: string;
      icon: React.ElementType;
    }
  > = {
    FOUND: {
      borderColor: 'border-green-500',
      bgColor: 'bg-green-50',
      iconColor: 'text-green-500',
      textColor: 'text-green-700',
      badgeVariant: 'default',
      badgeClass: 'bg-green-100 text-green-700 hover:bg-green-100',
      icon: CheckCircle2,
    },
    MISSING: {
      borderColor: 'border-red-500',
      bgColor: 'bg-red-50',
      iconColor: 'text-red-500',
      textColor: 'text-red-700',
      badgeVariant: 'destructive',
      badgeClass: '',
      icon: XCircle,
    },
    ERROR: {
      borderColor: 'border-orange-500',
      bgColor: 'bg-orange-50',
      iconColor: 'text-orange-500',
      textColor: 'text-orange-700',
      badgeVariant: 'destructive',
      badgeClass: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
      icon: AlertCircle,
    },
    PENDING: {
      borderColor: 'border-gray-300',
      bgColor: 'bg-gray-50',
      iconColor: 'text-gray-400',
      textColor: 'text-gray-500',
      badgeVariant: 'secondary',
      badgeClass: '',
      icon: Clock,
    },
  };

  return configs[status];
}

function getStatusColorClass(
  color: 'green' | 'red' | 'gray' | 'orange'
): string {
  const classes: Record<string, string> = {
    green: 'text-green-500',
    red: 'text-red-500',
    gray: 'text-gray-400',
    orange: 'text-orange-500',
  };
  return classes[color];
}

function getProgressColorClass(
  color: 'green' | 'red' | 'gray' | 'orange'
): string {
  const classes: Record<string, string> = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    gray: 'bg-gray-400',
    orange: 'bg-orange-500',
  };
  return classes[color];
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

// ============================================================================
// Exports
// ============================================================================

export default LiveLoginStatus;
