import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Activity, Server, Wifi, WifiOff, Cpu } from 'lucide-react';

import { useActiveRunners } from '@/hooks/use-active-runners';
import { ScraperRunner } from '@/types/scraper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function FleetStatusWidget() {
  const { runners, isLoading } = useActiveRunners();

  const onlineRunners = runners.filter((r) => r.status === 'online' || r.status === 'busy');
  const totalOnline = onlineRunners.length;

  const getStatusColor = (status: ScraperRunner['status']) => {
    switch (status) {
      case 'online':
        return 'bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/25 border-green-500/20';
      case 'busy':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 border-amber-500/20';
      case 'offline':
        return 'bg-slate-500/15 text-slate-700 dark:text-slate-400 hover:bg-slate-500/25 border-slate-500/20';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  const getStatusIcon = (status: ScraperRunner['status']) => {
    switch (status) {
      case 'online':
        return <Wifi className="h-3 w-3 mr-1" />;
      case 'busy':
        return <Activity className="h-3 w-3 mr-1" />;
      case 'offline':
        return <WifiOff className="h-3 w-3 mr-1" />;
      default:
        return <Server className="h-3 w-3 mr-1" />;
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Fleet Status</CardTitle>
        <Badge variant={totalOnline > 0 ? "default" : "secondary"} className={totalOnline > 0 ? "bg-green-600 hover:bg-green-700" : ""}>
          {isLoading ? (
            <span className="animate-pulse">...</span>
          ) : (
            `${totalOnline} Online`
          )}
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : runners.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground p-4">
            <Server className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No runners detected</p>
          </div>
        ) : (
          <ScrollArea className="h-[200px] px-4 pb-4">
            <div className="space-y-3 pt-2">
              {runners.map((runner) => (
                <div
                  key={runner.name}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground shadow-sm"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate" title={runner.name}>
                        {runner.name}
                      </span>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <span className="truncate">
                        Seen {formatDistanceToNow(new Date(runner.last_seen_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                    <Badge 
                      variant="outline" 
                      className={`capitalize flex items-center whitespace-nowrap ${getStatusColor(runner.status)}`}
                    >
                      {getStatusIcon(runner.status)}
                      {runner.status}
                    </Badge>
                    
                    {runner.status === 'busy' && runner.current_job_id && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center text-xs text-amber-600 dark:text-amber-500 cursor-help max-w-[100px]">
                              <Cpu className="h-3 w-3 mr-1 shrink-0" />
                              <span className="truncate font-mono">
                                {runner.current_job_id.slice(0, 8)}...
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Processing Job: {runner.current_job_id}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
