/**
 * Login Status Panel
 *
 * Displays login validation status in real-time.
 * Shows username field, password field, submit button, and success indicator status.
 */

'use client';

import { useMemo } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    CheckCircle2,
    XCircle,
    Lock,
    Unlock,
    ArrowRight,
    Check,
} from 'lucide-react';

interface LoginEvent {
    username_field_status?: string;
    password_field_status?: string;
    submit_button_status?: string;
    success_indicator_status?: string;
    overall_status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'ERROR';
    duration_ms?: number;
    error_message?: string;
    timestamp: string;
}

interface LoginStatusPanelProps {
    scraperName: string;
    sku: string;
    loginEvent?: LoginEvent;
    className?: string;
}

export function LoginStatusPanel({
    scraperName,
    sku,
    loginEvent,
    className,
}: LoginStatusPanelProps) {
    const status = useMemo(() => {
        if (!loginEvent) {
            return {
                status: 'pending',
                message: 'Waiting for login...',
                steps: [],
            };
        }

        const steps = [
            {
                name: 'Username Field',
                status: loginEvent.username_field_status || 'PENDING',
                icon: Unlock,
            },
            {
                name: 'Password Field',
                status: loginEvent.password_field_status || 'PENDING',
                icon: Lock,
            },
            {
                name: 'Submit Button',
                status: loginEvent.submit_button_status || 'PENDING',
                icon: ArrowRight,
            },
            {
                name: 'Success Indicator',
                status: loginEvent.success_indicator_status || 'PENDING',
                icon: Check,
            },
        ];

        let message = '';
        switch (loginEvent.overall_status) {
            case 'SUCCESS':
                message = 'Login successful!';
                break;
            case 'FAILED':
                message = loginEvent.error_message || 'Login failed';
                break;
            case 'SKIPPED':
                message = 'Login skipped (already authenticated)';
                break;
            case 'ERROR':
                message = loginEvent.error_message || 'Login error';
                break;
        }

        return {
            status: loginEvent.overall_status,
            message,
            steps,
        };
    }, [loginEvent]);

    const getStepStatus = (stepStatus: string) => {
        switch (stepStatus) {
            case 'FOUND':
                return { color: 'text-green-500', bg: 'bg-green-50', border: 'border-green-200' };
            case 'MISSING':
                return { color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' };
            case 'ERROR':
                return { color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' };
            case 'SKIPPED':
                return { color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200' };
            default:
                return { color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200' };
        }
    };

    const getOverallBadge = () => {
        const variants: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
            SUCCESS: 'default',
            FAILED: 'destructive',
            SKIPPED: 'secondary',
            ERROR: 'destructive',
        };
        const labels: Record<string, string> = {
            SUCCESS: 'Success',
            FAILED: 'Failed',
            SKIPPED: 'Skipped',
            ERROR: 'Error',
        };
        return (
            <Badge variant={variants[status.status] || 'outline'}>
                {labels[status.status] || status.status}
            </Badge>
        );
    };

    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Lock className="h-5 w-5" />
                        <CardTitle>Login Status</CardTitle>
                    </div>
                    {getOverallBadge()}
                </div>
                <CardDescription>
                    {scraperName} / SKU: {sku}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Message */}
                <div className="text-sm text-muted-foreground">{status.message}</div>

                {/* Login Steps */}
                <div className="space-y-3">
                    {status.steps.map((step, index) => {
                        const stepStatus = getStepStatus(step.status);
                        const Icon = step.icon;

                        return (
                            <div
                                key={step.name}
                                className={`flex items-center justify-between p-3 rounded-lg border ${stepStatus.border} ${stepStatus.bg}`}
                            >
                                <div className="flex items-center gap-3">
                                    <Icon className={`h-4 w-4 ${stepStatus.color}`} />
                                    <span className="font-medium">{step.name}</span>
                                </div>
                                <Badge
                                    variant={
                                        step.status === 'FOUND'
                                            ? 'default'
                                            : step.status === 'MISSING' || step.status === 'ERROR'
                                            ? 'destructive'
                                            : 'secondary'
                                    }
                                >
                                    {step.status}
                                </Badge>
                            </div>
                        );
                    })}
                </div>

                {/* Duration */}
                {loginEvent?.duration_ms && (
                    <div className="text-xs text-muted-foreground text-right">
                        Duration: {loginEvent.duration_ms}ms
                    </div>
                )}

                {status.status === 'pending' && (
                    <div className="text-center py-8 text-muted-foreground">
                        Waiting for login validation...
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
