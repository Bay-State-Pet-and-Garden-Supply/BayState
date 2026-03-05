-- Create migration_log table for tracking sync history
CREATE TABLE IF NOT EXISTS migration_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sync_type text NOT NULL, -- 'products', 'customers', 'orders'
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    status text NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
    processed integer NOT NULL DEFAULT 0,
    created integer NOT NULL DEFAULT 0,
    updated integer NOT NULL DEFAULT 0,
    failed integer NOT NULL DEFAULT 0,
    duration_ms integer,
    errors jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb
);

-- Add index for querying by sync type and date
CREATE INDEX IF NOT EXISTS migration_log_sync_type_idx ON migration_log(sync_type, started_at DESC);

-- Add RLS policies for admin access only
ALTER TABLE migration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view all migration logs"
    ON migration_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

CREATE POLICY "Admin can insert migration logs"
    ON migration_log FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

CREATE POLICY "Admin can update migration logs"
    ON migration_log FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );
