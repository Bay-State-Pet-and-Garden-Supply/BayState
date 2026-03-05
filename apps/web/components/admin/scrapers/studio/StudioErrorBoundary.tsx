'use client';

import { Component, ReactNode, ErrorInfo } from 'react';
import { toast } from 'sonner';
import {
  RefreshCw,
  WifiOff,
  Database,
  AlertTriangle,
  Home,
  AlertTriangle as AlertTriangleIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export type StudioErrorType =
  | 'websocket'
  | 'api_timeout'
  | 'database'
  | 'unknown';

interface StudioErrorBoundaryProps {
  children: ReactNode;
  componentName?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  fallback?: ReactNode;
  className?: string;
}

interface StudioErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorType: StudioErrorType;
  errorInfo: ErrorInfo | null;
}

function parseErrorType(error: Error): StudioErrorType {
  const message = error.message.toLowerCase();
  const stack = (error.stack || '').toLowerCase();

  if (
    message.includes('websocket') ||
    message.includes('ws://') ||
    message.includes('wss://') ||
    stack.includes('websocket')
  ) {
    return 'websocket';
  }

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnaborted') ||
    stack.includes('timeout')
  ) {
    return 'api_timeout';
  }

  if (
    message.includes('database') ||
    message.includes('supabase') ||
    message.includes('postgres') ||
    message.includes('sql') ||
    stack.includes('database')
  ) {
    return 'database';
  }

  return 'unknown';
}

function getErrorConfig(type: StudioErrorType) {
  const configs: Record<
    StudioErrorType,
    {
      icon: typeof WifiOff;
      iconColor: string;
      iconBg: string;
      title: string;
      description: string;
      suggestion: string;
      badgeLabel: string;
      badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
    }
  > = {
    websocket: {
      icon: WifiOff,
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-100',
      title: 'Connection Lost',
      description: 'WebSocket connection was interrupted',
      suggestion: 'The system will automatically retry. If this persists, check your network connection.',
      badgeLabel: 'WebSocket Error',
      badgeVariant: 'secondary',
    },
    api_timeout: {
      icon: AlertTriangle,
      iconColor: 'text-orange-500',
      iconBg: 'bg-orange-100',
      title: 'Request Timeout',
      description: 'The server took too long to respond',
      suggestion: 'Click retry to attempt the request again. If the issue persists, the server may be busy.',
      badgeLabel: 'API Timeout',
      badgeVariant: 'secondary',
    },
    database: {
      icon: Database,
      iconColor: 'text-red-500',
      iconBg: 'bg-red-100',
      title: 'Database Error',
      description: 'Could not retrieve or save data',
      suggestion: 'This may be a temporary issue. Please try again in a few moments.',
      badgeLabel: 'Database Error',
      badgeVariant: 'destructive',
    },
    unknown: {
      icon: AlertTriangle,
      iconColor: 'text-gray-500',
      iconBg: 'bg-gray-100',
      title: 'Something went wrong',
      description: 'An unexpected error occurred',
      suggestion: 'Please try again. If the problem persists, contact support.',
      badgeLabel: 'Unknown Error',
      badgeVariant: 'outline',
    },
  };

  return configs[type];
}

export class StudioErrorBoundary extends Component<
  StudioErrorBoundaryProps,
  StudioErrorBoundaryState
> {
  constructor(props: StudioErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorType: 'unknown',
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<StudioErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorType: parseErrorType(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('StudioErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
      errorType: parseErrorType(error),
    });

    const config = getErrorConfig(this.state.errorType);
    toast.error(`${config.title}: ${error.message}`, {
      description: config.suggestion,
      duration: 5000,
    });
  }

  handleRetry = (): void => {
    const { onRetry } = this.props;

    this.setState({
      hasError: false,
      error: null,
      errorType: 'unknown',
      errorInfo: null,
    });

    if (onRetry) {
      onRetry();
    }

    toast.success('Retrying...');
  };

  handleDismiss = (): void => {
    const { onDismiss } = this.props;

    this.setState({
      hasError: false,
      error: null,
      errorType: 'unknown',
      errorInfo: null,
    });

    if (onDismiss) {
      onDismiss();
    }
  };

  handleGoHome = (): void => {
    window.location.href = '/admin/scrapers/studio';
  };

  render(): ReactNode {
    const { children, fallback, className, componentName } = this.props;
    const { hasError, error, errorType, errorInfo } = this.state;

    if (!hasError) {
      return children;
    }

    if (fallback) {
      return fallback;
    }

    const config = getErrorConfig(errorType);
    const Icon = config.icon;

    return (
      <Card className={className}>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.iconBg}`}>
              <Icon className={`h-5 w-5 ${config.iconColor}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Error in {componentName || 'Component'}</CardTitle>
                <Badge variant={config.badgeVariant}>{config.badgeLabel}</Badge>
              </div>
              <CardDescription>{config.title}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="h-5 w-5 text-red-500 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-red-800">{config.description}</p>
                {error && (
                  <p className="text-xs text-red-600 font-mono break-all">{error.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Suggestion:</span> {config.suggestion}
            </p>
          </div>

          {process.env.NODE_ENV === 'development' && errorInfo && (
            <details className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">
                Technical Details (Development Only)
              </summary>
              <pre className="mt-3 overflow-auto rounded bg-gray-900 p-4 text-xs text-gray-100">
                <code>{error?.stack}</code>
                {'\n\nComponent Stack:\n'}
                <code>{errorInfo.componentStack}</code>
              </pre>
            </details>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={this.handleRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button variant="outline" onClick={this.handleDismiss}>
              Dismiss
            </Button>
            <Button variant="ghost" onClick={this.handleGoHome}>
              <Home className="mr-2 h-4 w-4" />
              Go to Studio
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
}

export function withStudioErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
): React.ComponentType<P> {
  const displayName = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Component';

  return function WithErrorBoundary(props: P) {
    return (
      <StudioErrorBoundary componentName={displayName}>
        <WrappedComponent {...props} />
      </StudioErrorBoundary>
    );
  };
}
