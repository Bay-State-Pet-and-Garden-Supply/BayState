'use client';

import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, AlertCircle, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MigrationLogEntry } from '@/lib/admin/migration/history';

interface MigrationHistoryProps {
    initialLogs: MigrationLogEntry[];
}

export function MigrationHistory({ initialLogs }: MigrationHistoryProps) {
    const [logs, setLogs] = useState<MigrationLogEntry[]>(initialLogs);
    const supabase = createClient();

    useEffect(() => {
        // Subscribe to real-time changes in migration_log
        const channel = supabase
            .channel('migration-log-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'migration_log',
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        // Add new log to the top
                        setLogs((current) => [payload.new as MigrationLogEntry, ...current]);
                    } else if (payload.eventType === 'UPDATE') {
                        // Update existing log
                        setLogs((current) =>
                            current.map((log) =>
                                log.id === payload.new.id ? (payload.new as MigrationLogEntry) : log
                            )
                        );
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase]);

    return (
        <Card className="h-full">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        Sync History
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                    </CardTitle>
                </div>
                <CardDescription>Log of past synchronization tasks</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[400px]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Processed</TableHead>
                                <TableHead className="text-right">Created</TableHead>
                                <TableHead className="text-right">Updated</TableHead>
                                <TableHead className="text-right">Failed</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No history record found. Run a sync to get started.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell>
                                            <Badge variant="outline" className="capitalize font-normal text-xs">
                                                {log.sync_type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                            {formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={log.status} />
                                            {log.errors && log.errors.length > 0 && (
                                                <div className="mt-1 text-xs text-red-500 font-medium flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" />
                                                    {log.errors.length} errors
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right text-xs font-mono">{log.processed}</TableCell>
                                        <TableCell className="text-right text-xs font-mono text-green-600">+{log.created}</TableCell>
                                        <TableCell className="text-right text-xs font-mono text-blue-600">~{log.updated}</TableCell>
                                        <TableCell className="text-right text-xs font-mono text-red-600">
                                            {log.failed > 0 && `!${log.failed}`}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'completed':
            return (
                <div className="flex items-center text-green-600 text-xs font-medium">
                    <CheckCircle className="w-3 h-3 mr-1" /> Completed
                </div>
            );
        case 'failed':
            return (
                <div className="flex items-center text-red-600 text-xs font-medium">
                    <XCircle className="w-3 h-3 mr-1" /> Failed
                </div>
            );
        case 'running':
            return (
                <div className="flex items-center text-blue-600 text-xs font-medium animate-pulse">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running
                </div>
            );
        default:
            return <div className="text-xs text-muted-foreground capitalize">{status}</div>;
    }
}
