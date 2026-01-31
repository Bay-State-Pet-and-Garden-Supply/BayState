/**
 * Extraction Results Table
 *
 * Displays field-level extraction results in a table format.
 * Shows field name, extracted value, and status for each extraction.
 */

'use client';

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
    CheckCircle2,
    XCircle,
    AlertCircle,
    Search,
} from 'lucide-react';

interface ExtractionEvent {
    field_name: string;
    field_value?: string;
    status: 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FOUND';
    duration_ms?: number;
    error_message?: string;
    timestamp: string;
}

interface ExtractionResultsTableProps {
    scraperName: string;
    sku: string;
    extractionEvents: ExtractionEvent[];
    className?: string;
}

export function ExtractionResultsTable({
    scraperName,
    sku,
    extractionEvents,
    className,
}: ExtractionResultsTableProps) {
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'EMPTY':
                return <AlertCircle className="h-4 w-4 text-yellow-500" />;
            case 'NOT_FOUND':
                return <XCircle className="h-4 w-4 text-red-500" />;
            case 'ERROR':
                return <XCircle className="h-4 w-4 text-orange-500" />;
            default:
                return <Search className="h-4 w-4 text-gray-400" />;
        }
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
            SUCCESS: 'default',
            EMPTY: 'secondary',
            NOT_FOUND: 'destructive',
            ERROR: 'destructive',
        };
        return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
    };

    const stats = {
        total: extractionEvents.length,
        success: extractionEvents.filter((e) => e.status === 'SUCCESS').length,
        empty: extractionEvents.filter((e) => e.status === 'EMPTY').length,
        failed: extractionEvents.filter((e) => e.status === 'NOT_FOUND' || e.status === 'ERROR').length,
    };

    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Search className="h-5 w-5" />
                        <CardTitle>Extraction Results</CardTitle>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {stats.success}/{stats.total} successful
                    </div>
                </div>
                <CardDescription>
                    {scraperName} / SKU: {sku}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {extractionEvents.length > 0 ? (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Field</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead className="text-right">Duration</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {extractionEvents.map((event, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(event.status)}
                                                <span className="font-mono">{event.field_name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(event.status)}</TableCell>
                                        <TableCell className="max-w-xs truncate">
                                            {event.field_value || (
                                                <span className="text-muted-foreground italic">
                                                    {event.status === 'EMPTY' ? '(empty)' : '(not found)'}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {event.duration_ms ? `${event.duration_ms}ms` : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        No extraction results yet
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
