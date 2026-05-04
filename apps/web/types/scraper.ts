export interface ScraperRunner {
  name: string;
  last_seen_at: string;
  status: 'online' | 'offline' | 'busy' | 'idle' | 'polling' | 'paused';
  enabled: boolean;
  current_job_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ScrapeJob {
  status: string;
  created_at: string | null;
  completed_at: string | null;
  skus: string[] | null;
}
