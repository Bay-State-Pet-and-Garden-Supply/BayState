/**
 * TestLabErrorBoundary Component
 *
 * Catches React errors in Test Lab components and displays a user-friendly
 * fallback UI with retry functionality. Handles specific error types with
 * contextual messages and actions.
 */

'use client';

import { Component, ReactNode, ErrorInfo } from 'react';
import { toast } from 'sonner';
import {
  RefreshCw,
  WifiOff,
  Clock,
  Database,
  AlertTriangle,
  Bug,
  Home,
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

/** Error types for contextual handling */
export type TestLabErrorType =
  | 'websocket'
  | 'api_timeout'
  | 'database'
  | 'test_run_failed'
  | 'unknown';

/** Props for TestLabErrorBoundary */
interface TestLabErrorBoundaryProps {
  /** The child components to wrap */
  children: ReactNode;
  /** Optional component name for error context */
  componentName?: string;
  /** Optional callback when error is dismissed */
  onDismiss?: () => void;
  /** Optional callback when retry is clicked */
  onRetry?: () => void;
  /** Fallback UI to show when error occurs */
  fallback?: ReactNode;
  /** CSS class for the error card */
  className?: string;
}

/** State for TestLabErrorBoundary */
interface TestLabErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorType: TestLabErrorType;
  errorInfo: ErrorInfo | null;
}

/** Parse error type from error message or stack */
function parseErrorType(error: Error): TestLabErrorType {
  const message = error.message.toLowerCase();
  const stack = (error.stack || '').toLowerCase();

  // Check for specific error patterns
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

  if (
    message.includes('test') ||
    message.includes('run') ||
    message.includes('failed') ||
    message.includes('scraper')
  ) {
    return 'test_run_failed';
  }

  return 'unknown';
}

/** Get error configuration based on type */
function getErrorConfig(type: TestLabErrorType) {
  const configs: Record<TestLabErrorType, {
    icon: typeof WifiOff;
    iconColor: string;
    iconBg: string;
    title: string;
    description: string;
    suggestion: string;
    badgeLabel: string;
    badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  }> = {
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
      icon: Clock,
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
    test_run_failed: {
      icon: AlertTriangle,
      iconColor: 'text-yellow-500',
      iconBg: 'bg-yellow-100',
      title: 'Test Run Error',
      description: 'The test encountered an error during execution',
      suggestion: 'Check the test logs for details. You may need to update your scraper configuration.',
      badgeLabel: 'Test Failed',
      badgeVariant: 'secondary',
    },
    unknown: {
      icon: Bug,
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

/**
 * TestLabErrorBoundary Component
 *
 * Wraps child components and catches any React errors that occur during rendering,
 * in lifecycle methods, or in constructors of child components.
 */
export class TestLabErrorBoundary extends Component<
  TestLabErrorBoundaryProps,
  TestLabErrorBoundaryState
> {
  constructor(props: TestLabErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorType: 'unknown',
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<TestLabErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorType: parseErrorType(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error for debugging
    console.error('TestLabErrorBoundary caught an error:', error, errorInfo);

    // Update state with error info
    this.setState({
      error,
      errorInfo,
      errorType: parseErrorType(error),
    });

    // Show toast notification
    const config = getErrorConfig(this.state.errorType);
    toast.error(`${config.title}: ${error.message}`, {
      description: config.suggestion,
      duration: 5000,
    });
  }

  handleRetry = (): void => {
    const { onRetry } = this.props;

    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorType: 'unknown',
      errorInfo: null,
    });

    // Call optional onRetry callback
    if (onRetry) {
      onRetry();
    }

    // Show success toast
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
    // Navigate to home or parent page
    window.location.href = '/admin/scrapers';
  };

  render(): ReactNode {
    const { children, fallback, className, componentName } = this.props;
    const { hasError, error, errorType, errorInfo } = this.state;

    if (!hasError) {
      return children;
    }

    // Use custom fallback if provided
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
          {/* Error Description */}
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-red-800">
                  {config.description}
                </p>
                {error && (
                  <p className="text-xs text-red-600 font-mono break-all">
                    {error.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Suggestion */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Suggestion:</span> {config.suggestion}
            </p>
          </div>

          {/* Error Details (collapsible in development) */}
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

          {/* Action Buttons */}
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
              Go to Scrapers
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
}

/**
 * Higher-order component wrapper for easy error boundary usage
 */
export function withTestLabErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
): React.ComponentType<P> {
  const displayName = componentName || Component.displayName || Component.name || 'Component';

  return function WrappedComponent(props: P) {
    return (
      <TestLabErrorBoundary componentName={displayName}>
        <Component {...props} />
      </TestLabErrorBoundary>
    );
  };
}
