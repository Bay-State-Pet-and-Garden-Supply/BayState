'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, Activity, CheckCircle, AlertTriangle, XCircle, Settings, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { B2BFeed } from '@/lib/b2b/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface FeedCardProps {
  feed: B2BFeed;
}

export function FeedCard({ feed }: FeedCardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/admin/b2b/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributor_code: feed.distributor_code, job_type: 'full' }),
      });
      
      if (!res.ok) throw new Error('Failed to start sync');
      
      toast.success('Sync started successfully');
    } catch {
      toast.error('Failed to start sync');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const res = await fetch('/api/admin/b2b/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributor_code: feed.distributor_code, action: 'test' }),
      });

      if (!res.ok) throw new Error('Connection test failed');
      
      const data = await res.json();
      if (data.success) {
        toast.success('Connection test passed');
      } else {
         toast.error(data.message || 'Connection test failed');
      }
    } catch {
      toast.error('Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'degraded': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'offline': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {feed.display_name}
        </CardTitle>
        <Badge variant={feed.enabled ? 'default' : 'secondary'}>
          {feed.feed_type}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="flex items-center space-x-2">
            {getStatusIcon(feed.status)}
            <span className="text-sm font-medium capitalize">{feed.status}</span>
          </div>
          
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Last Sync</p>
            <p className="text-sm font-medium">
              {feed.last_sync_at 
                ? formatDistanceToNow(new Date(feed.last_sync_at), { addSuffix: true }) 
                : 'Never'}
            </p>
          </div>

          <div className="space-y-1">
             <p className="text-xs text-muted-foreground">Products</p>
             <p className="text-sm font-medium">{feed.products_count.toLocaleString()}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <div className="flex w-full gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1" 
            asChild
          >
            <Link href={`/admin/b2b/${feed.distributor_code.toLowerCase()}`}>
              <Settings className="mr-2 h-3 w-3" />
              Configure
            </Link>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1" 
            onClick={handleTest}
            disabled={isTesting}
          >
            {isTesting ? 'Testing...' : 'Test'}
          </Button>
        </div>
        <Button 
          size="sm" 
          className="w-full bg-[#008850] hover:bg-[#00663c]" 
          onClick={handleSync}
          disabled={!feed.enabled || feed.status === 'unconfigured' || isSyncing}
        >
          {isSyncing ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
          Sync
        </Button>
      </CardFooter>
    </Card>
  );
}
