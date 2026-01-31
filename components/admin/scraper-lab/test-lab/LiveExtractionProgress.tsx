/**
 * Live Extraction Progress
 *
 * Real-time component showing field extraction progress with live updates.
 * Displays field name, truncated value preview, and status for each extraction.
 * Features expandable rows to view full values and progress statistics.
 */

'use client';

import { useState } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    CheckCircle2,
    AlertCircle,
    XCircle,
    HelpCircle,
    ChevronDown,
    ChevronRight,
    Activity,
} from 'lucide-react';

export type ExtractionStatus = 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FOUND';

export interface ExtractionEvent {
    field_name?: string;
    field_value?: string;
    status: ExtractionStatus;
    duration_ms?: number;
    error_message?: string;
    timestamp: string | number;
}

interface LiveExtractionProgressProps {
    extractionEvents: ExtractionEvent[];
    totalFields?: number;
    className?: string;
}

const STATUS_CONFIG: Record<ExtractionStatus, {
    icon: React.ReactNode;
    badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
    color: string;
    label: string;
}> = {
    SUCCESS: {
        icon: <CheckCircle2 className="h-4 w-4" />,
        badgeVariant: 'default',
        color: 'text-green-600 bg-green-50 border-green-200',
        label: 'Success',
    },
    EMPTY: {
        icon: <AlertCircle className="h-4 w-4" />,
        badgeVariant: 'secondary',
        color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
        label: 'Empty',
    },
    ERROR: {
        icon: <XCircle className="h-4 w-4" />,
        badgeVariant: 'destructive',
        color: 'text-red-600 bg-red-50 border-red-200',
        label: 'Error',
    },
    NOT_FOUND: {
        icon: <HelpCircle className="h-4 w-4" />,
        badgeVariant: 'outline',
        color: 'text-gray-600 bg-gray-50 border-gray-200',
        label: 'Not Found',
    },
};

function truncateValue(value: string | undefined, maxLength: number = 50): string {
    if (!value) return '';
    if (value.length <= maxLength) return value;
    return value.substring(0, maxLength) + '...';
}

function stripHtml(html: string): string {
    if (!html) return '';
    // Remove HTML tags
    return html.replace(/<[^>]*>/g, '');
}

function ExtractionRow({ event }: { event: ExtractionEvent }) {
    const [isOpen, setIsOpen] = useState(false);
    const config = STATUS_CONFIG[event.status];
    const cleanValue = stripHtml(event.field_value || '');
    const truncatedValue = truncateValue(cleanValue);
    const hasMoreContent = cleanValue.length > 50;

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <TableRow className="group">
                <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                        <span className={`p-1 rounded-full ${config.color}`}>
                            {config.icon}
                        </span>
                        <span className="font-mono text-sm">{event.field_name}</span>
                    </div>
                </TableCell>
                <TableCell>
                    <Badge variant={config.badgeVariant} className="text-xs">
                        {config.label}
                    </Badge>
                </TableCell>
                <TableCell className="max-w-md">
                    <CollapsibleTrigger asChild>
                        <button
                            className="text-left w-full hover:bg-muted/50 rounded px-2 py-1 -mx-2 transition-colors"
                            disabled={!hasMoreContent && !cleanValue}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground truncate">
                                    {cleanValue ? (
                                        truncatedValue
                                    ) : (
                                        <span className="italic">
                                            {event.status === 'EMPTY' ? '(empty)' : 
                                             event.status === 'NOT_FOUND' ? '(not found)' : 
                                             '(no value)'}
                                        </span>
                                    )}
                                </span>
                                {hasMoreContent && (
                                    <span className="text-xs text-muted-foreground shrink-0">
                                        {isOpen ? (
                                            <ChevronDown className="h-3 w-3" />
                                        ) : (
                                            <ChevronRight className="h-3 w-3" />
                                        )}
                                    </span>
                                )}
                            </div>
                        </button>
                    </CollapsibleTrigger>
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm">
                    {event.duration_ms ? `${event.duration_ms}ms` : '-'}
                </TableCell>
            </TableRow>
            {hasMoreContent && (
                <CollapsibleContent asChild>
                    <TableRow className="bg-muted/30">
                        <TableCell colSpan={4} className="py-3">
                            <div className="pl-8 pr-4">
                                <p className="text-xs text-muted-foreground mb-1">Full value:</p>
                                <pre className="text-xs bg-background border rounded p-3 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                                    {cleanValue}
                                </pre>
                                {event.error_message && (
                                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                        <strong>Error:</strong> {event.error_message}
                                    </div>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                </CollapsibleContent>
            )}
        </Collapsible>
    );
}

export function LiveExtractionProgress({
    extractionEvents,
    totalFields,
    className,
}: LiveExtractionProgressProps) {
    const extractedCount = extractionEvents.length;
    const totalCount = totalFields || extractedCount;
    const progressPercentage = totalCount > 0 
        ? Math.round((extractedCount / totalCount) * 100) 
        : 0;

    const statusCounts = {
        success: extractionEvents.filter((e) => e.status === 'SUCCESS').length,
        empty: extractionEvents.filter((e) => e.status === 'EMPTY').length,
        error: extractionEvents.filter((e) => e.status === 'ERROR').length,
        notFound: extractionEvents.filter((e) => e.status === 'NOT_FOUND').length,
    };

    return (
        <Card className={className}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">Live Extraction Progress</CardTitle>
                    </div>
                    <div className="text-sm font-medium">
                        <span className="text-primary">{extractedCount}</span>
                        <span className="text-muted-foreground"> of </span>
                        <span className="text-muted-foreground">{totalCount}</span>
                        <span className="text-muted-foreground"> fields extracted</span>
                    </div>
                </div>
                <CardDescription>
                    Real-time field extraction status and values
                </CardDescription>
                
                {/* Progress Bar */}
                <div className="mt-3">
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-primary transition-all duration-500 ease-out"
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <div className="flex gap-3">
                            {statusCounts.success > 0 && (
                                <span className="flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    {statusCounts.success} success
                                </span>
                            )}
                            {statusCounts.empty > 0 && (
                                <span className="flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3 text-yellow-600" />
                                    {statusCounts.empty} empty
                                </span>
                            )}
                            {statusCounts.error > 0 && (
                                <span className="flex items-center gap-1">
                                    <XCircle className="h-3 w-3 text-red-600" />
                                    {statusCounts.error} error
                                </span>
                            )}
                            {statusCounts.notFound > 0 && (
                                <span className="flex items-center gap-1">
                                    <HelpCircle className="h-3 w-3 text-gray-600" />
                                    {statusCounts.notFound} not found
                                </span>
                            )}
                        </div>
                        <span>{progressPercentage}%</span>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {extractionEvents.length > 0 ? (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-1/4">Field</TableHead>
                                    <TableHead className="w-1/6">Status</TableHead>
                                    <TableHead>Value Preview</TableHead>
                                    <TableHead className="text-right w-24">Duration</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {extractionEvents.map((event, index) => (
                                    <ExtractionRow key={`${event.field_name}-${index}`} event={event} />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        <Activity className="h-8 w-8 mx-auto mb-3 opacity-50" />
                        <p>Waiting for extraction events...</p>
                        <p className="text-sm mt-1">
                            Fields will appear here as they are extracted
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
