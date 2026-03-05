'use client';

import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { Terminal } from 'lucide-react';

interface LogEntry {
    id: string;
    job_id: string;
    level: string;
    message: string;
    created_at: string;
}

interface LogViewerProps {
    jobId: string;
    initialLogs?: LogEntry[];
    className?: string;
}

export function LogViewer({ jobId, initialLogs = [], className }: LogViewerProps) {
    const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
    const [autoScroll, setAutoScroll] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const supabase = createClient();

    useEffect(() => {
        // Load initial logs
        const fetchLogs = async () => {
            const { data, error } = await supabase
                .from('scrape_job_logs')
                .select('*')
                .eq('job_id', jobId)
                .order('created_at', { ascending: true })
                .limit(1000);
            
            if (!error && data) {
                setLogs(data);
            }
        };
        
        if (jobId) {
            fetchLogs();
        }

        // Subscribe to real-time changes
        const channel = supabase
            .channel(`logs-${jobId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'scrape_job_logs',
                    filter: `job_id=eq.${jobId}`,
                },
                (payload) => {
                    const newLog = payload.new as LogEntry;
                    setLogs((prev) => [...prev, newLog]);
                }
            )
            .subscribe((status) => {
                setIsConnected(status === 'SUBSCRIBED');
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [jobId, supabase]);

    useEffect(() => {
        if (autoScroll && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll]);

    return (
        <Card className={`flex flex-col h-full border-none shadow-none rounded-none ${className}`}>
            <CardHeader className="py-2 px-4 border-b bg-muted/20">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-muted-foreground" />
                        <h3 className="font-medium text-sm">Execution Logs</h3>
                        {isConnected ? (
                            <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px] h-5 px-1.5 gap-1">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                                </span>
                                Live
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-muted-foreground text-[10px] h-5 px-1.5">Offline</Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center space-x-2">
                            <Switch 
                                id="auto-scroll" 
                                checked={autoScroll} 
                                onCheckedChange={setAutoScroll}
                                className="scale-75"
                            />
                            <Label htmlFor="auto-scroll" className="text-xs cursor-pointer text-muted-foreground">Auto-scroll</Label>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden relative bg-slate-950 text-slate-300 font-mono text-xs">
                <ScrollArea className="h-full w-full">
                    <div className="p-4 space-y-0.5">
                        {logs.length === 0 && (
                            <div className="text-slate-600 italic py-8 text-center">
                                No logs available.
                            </div>
                        )}
                        {logs.map((log) => (
                            <div key={log.id} className="flex gap-3 hover:bg-slate-900/50 -mx-4 px-4 py-0.5 items-start">
                                <span className="text-slate-600 shrink-0 select-none w-[100px] text-[10px] pt-0.5">
                                    {format(new Date(log.created_at), 'HH:mm:ss.SSS')}
                                </span>
                                <span className={`shrink-0 w-[50px] font-bold ${getLevelColor(log.level)}`}>
                                    {log.level}
                                </span>
                                <span className="break-all whitespace-pre-wrap flex-1">{log.message}</span>
                            </div>
                        ))}
                        <div ref={bottomRef} className="h-1" />
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

function getLevelColor(level: string) {
    switch (level?.toUpperCase()) {
        case 'ERROR': return 'text-red-400';
        case 'CRITICAL': return 'text-red-500';
        case 'WARNING': return 'text-yellow-400';
        case 'INFO': return 'text-blue-400';
        case 'DEBUG': return 'text-slate-500';
        default: return 'text-slate-300';
    }
}
