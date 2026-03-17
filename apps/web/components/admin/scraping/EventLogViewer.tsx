'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import { Activity, Filter, Loader2 } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DataTable,
  Column,
} from '@/components/admin/data-table';
import type { ScraperEvent, EventSeverity } from '@/types/scraper';

interface EventLogViewerProps {
  jobId: string;
  className?: string;
}

const severityConfig: Record<EventSeverity, { label: string; className: string }> = {
  DEBUG: { label: 'DEBUG', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  INFO: { label: 'INFO', className: 'bg-blue-50 text-blue-600 border-blue-200' },
  WARNING: { label: 'WARNING', className: 'bg-yellow-50 text-yellow-600 border-yellow-200' },
  ERROR: { label: 'ERROR', className: 'bg-red-50 text-red-600 border-red-200' },
  CRITICAL: { label: 'CRITICAL', className: 'bg-red-100 text-red-700 border-red-300 font-bold' },
};

export function EventLogViewer({ jobId, className }: EventLogViewerProps) {
  const [events, setEvents] = useState<ScraperEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [runnerFilter, setRunnerFilter] = useState<string>('all');
  const [availableRunners, setAvailableRunners] = useState<string[]>([]);

  const supabase = createClient();

  // Fetch initial events
  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('scraper_events')
          .select('*')
          .eq('job_id', jobId)
          .order('timestamp', { ascending: true })
          .limit(2000);

        if (!error && data) {
          setEvents(data as ScraperEvent[]);
          // Extract unique runner names from data
          const runners = new Set<string>();
          data.forEach((event) => {
            const runnerName = event.data?.runner_name;
            if (runnerName) runners.add(runnerName);
          });
          setAvailableRunners(Array.from(runners).sort());
        }
      } catch (err) {
        console.error('Failed to fetch events:', err);
      } finally {
        setLoading(false);
      }
    };

    if (jobId) {
      fetchEvents();
    }

    // Subscribe to real-time INSERT events
    const channel = supabase
      .channel(`scraper-events-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scraper_events',
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          const newEvent = payload.new as ScraperEvent;
          setEvents((prev) => [...prev, newEvent]);

          // Update available runners if new one appears
          const runnerName = newEvent.data?.runner_name;
          if (runnerName && !availableRunners.includes(runnerName)) {
            setAvailableRunners((prev) => [...prev, runnerName].sort());
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, supabase]);

  // Filter events based on user selections
  const filteredEvents = useMemo(() => {
    let result = events;

    // Filter by errors only
    if (showErrorsOnly) {
      result = result.filter(
        (event) => event.severity === 'ERROR' || event.severity === 'CRITICAL'
      );
    }

    // Filter by runner
    if (runnerFilter && runnerFilter !== 'all') {
      result = result.filter(
        (event) => event.data?.runner_name === runnerFilter
      );
    }

    return result;
  }, [events, showErrorsOnly, runnerFilter]);

  // Define columns for the data table
  const columns: Column<ScraperEvent>[] = useMemo(
    () => [
      {
        key: 'timestamp',
        header: 'Timestamp',
        sortable: true,
        className: 'w-[180px] font-mono text-xs',
        render: (value) => {
          const timestamp = value as string;
          return timestamp
            ? format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss.SSS')
            : '-';
        },
      },
      {
        key: 'severity',
        header: 'Level',
        sortable: true,
        className: 'w-[100px]',
        render: (value) => {
          const severity = value as EventSeverity;
          const config = severityConfig[severity] || severityConfig.INFO;
          return (
            <Badge variant="outline" className={config.className}>
              {config.label}
            </Badge>
          );
        },
      },
      {
        key: 'runner_name',
        header: 'Source',
        sortable: true,
        className: 'w-[150px]',
        render: (_value, row) => {
          const runnerName = row.data?.runner_name || row.data?.source || '-';
          return (
            <span className="font-mono text-xs text-muted-foreground">
              {runnerName}
            </span>
          );
        },
      },
      {
        key: 'event_type',
        header: 'Message',
        searchable: true,
        render: (value, row) => {
          const eventType = value as string;
          const extraData = row.data;
          
          // Build a descriptive message
          let message = eventType;
          if (extraData?.sku) {
            message += ` - SKU: ${extraData.sku}`;
          }
          if (extraData?.url) {
            message += ` - ${extraData.url}`;
          }
          if (extraData?.error) {
            message += ` - ${extraData.error}`;
          }

          return (
            <div className="flex flex-col gap-1">
              <span className="text-sm">{message}</span>
              {extraData?.message && (
                <span className="text-xs text-muted-foreground">
                  {extraData.message}
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: 'data',
        header: 'Metadata',
        className: 'w-[200px] max-w-[200px]',
        render: (value) => {
          const data = value as Record<string, unknown>;
          if (!data || Object.keys(data).length === 0) {
            return <span className="text-muted-foreground text-xs">-</span>;
          }
          return (
            <pre className="text-[10px] bg-muted/50 p-1.5 rounded overflow-x-auto max-h-20 overflow-y-auto font-mono">
              {JSON.stringify(data, null, 0)}
            </pre>
          );
        },
      },
    ],
    []
  );

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Loading events...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="py-3 px-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium text-sm">Event Log</h3>
            <Badge variant="outline" className="text-xs">
              {filteredEvents.length} / {events.length} events
            </Badge>
            {isConnected ? (
              <Badge
                variant="outline"
                className="text-green-600 bg-green-50 border-green-200 text-[10px] h-5 px-1.5 gap-1"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
                Live
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-muted-foreground text-[10px] h-5 px-1.5"
              >
                Offline
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Show Errors Only Filter */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-errors-only"
                checked={showErrorsOnly}
                onCheckedChange={(checked) => setShowErrorsOnly(checked === true)}
              />
              <label
                htmlFor="show-errors-only"
                className="text-xs cursor-pointer text-muted-foreground flex items-center gap-1"
              >
                <Filter className="w-3 h-3" />
                Errors only
              </label>
            </div>

            {/* Filter by Runner */}
            <div className="flex items-center gap-2">
              <Select value={runnerFilter} onValueChange={setRunnerFilter}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue placeholder="All Runners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Runners</SelectItem>
                  {availableRunners.map((runner) => (
                    <SelectItem key={runner} value={runner}>
                      {runner}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          data={filteredEvents as any}
          columns={columns as any}
          pageSize={20}
          pageSizeOptions={[10, 20, 50, 100]}
          loading={false}
          emptyMessage={
            events.length === 0
              ? 'No events recorded for this job yet.'
              : 'No events match the current filters.'
          }
        />
      </CardContent>
    </Card>
  );
}
