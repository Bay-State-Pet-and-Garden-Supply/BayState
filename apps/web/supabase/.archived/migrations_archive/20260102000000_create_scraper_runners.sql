-- Create table for tracking active runners (both local and GitHub)
create table if not exists scraper_runners (
  name text primary key,
  last_seen_at timestamptz default now(),
  status text check (status in ('online', 'offline', 'busy')),
  current_job_id uuid references scrape_jobs(id),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Enable RLS
alter table scraper_runners enable row level security;

-- Policy: Admin read access
create policy "Admins can read runners"
  on scraper_runners for select
  to authenticated
  using (true);

-- Policy: Service role write access (via API)
create policy "Service role can manage runners"
  on scraper_runners for all
  to service_role
  using (true)
  with check (true);
