import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { B2BSyncJob, B2BFeed } from "@/lib/b2b/types";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

interface SyncHistoryProps {
  jobs: B2BSyncJob[];
  feeds: B2BFeed[];
}

export function SyncHistory({ jobs, feeds }: SyncHistoryProps) {
  const getFeedName = (feedId: string) => {
    const feed = feeds.find(f => f.id === feedId);
    return feed ? feed.display_name : feedId;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case 'running':
        return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600 animate-pulse"><Clock className="w-3 h-3 mr-1" /> Running</Badge>;
      default:
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" /> {status}</Badge>;
    }
  };

  const calculateDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return '-';
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diff = endDate.getTime() - startDate.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    return `${minutes}m ${seconds}s`;
  };

  if (jobs.length === 0) {
    return (
      <div className="text-center p-8 border rounded-lg bg-muted/20">
        <p className="text-muted-foreground">No sync history available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Distributor</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Fetched</TableHead>
            <TableHead className="text-right">Created</TableHead>
            <TableHead className="text-right">Updated</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Started</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-medium">{getFeedName(job.feed_id)}</TableCell>
              <TableCell className="capitalize">{job.job_type}</TableCell>
              <TableCell>{getStatusBadge(job.status)}</TableCell>
              <TableCell className="text-right">{job.products_fetched.toLocaleString()}</TableCell>
              <TableCell className="text-right text-green-600">+{job.products_created.toLocaleString()}</TableCell>
              <TableCell className="text-right text-blue-600">~{job.products_updated.toLocaleString()}</TableCell>
              <TableCell>{calculateDuration(job.started_at, job.completed_at)}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {job.started_at ? formatDistanceToNow(new Date(job.started_at), { addSuffix: true }) : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SyncHistorySkeleton() {
  return (
    <div className="rounded-md border p-4 space-y-4">
      <div className="h-8 bg-muted animate-pulse rounded w-full" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 bg-muted animate-pulse rounded w-full" />
      ))}
    </div>
  );
}
