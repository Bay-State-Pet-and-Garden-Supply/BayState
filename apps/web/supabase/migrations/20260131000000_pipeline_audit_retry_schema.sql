-- Pipeline Audit Log and Retry Queue Schema
-- Purpose: Track ETL pipeline state transitions and enable manual retry for failed jobs

BEGIN;

-- ============================================================================
-- 1. Pipeline Audit Log (state transition history)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type text NOT NULL,
    job_id uuid NOT NULL,
    from_state text,
    to_state text NOT NULL,
    actor_id uuid REFERENCES auth.users(id),
    actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system', 'user', 'service')),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_job ON pipeline_audit_log(job_type, job_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_state ON pipeline_audit_log(to_state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_actor ON pipeline_audit_log(actor_id, created_at DESC);

COMMENT ON TABLE pipeline_audit_log IS 'Immutable audit trail for ETL pipeline state transitions.';
COMMENT ON COLUMN pipeline_audit_log.job_type IS 'Type of job (e.g., scrape_job, consolidation_job).';
COMMENT ON COLUMN pipeline_audit_log.actor_type IS 'Who triggered the transition: system (auto), user (manual), service (API).';

-- ============================================================================
-- 2. Pipeline Retry Queue (manual retry tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_retry_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type text NOT NULL,
    original_job_id uuid NOT NULL,
    retry_reason text NOT NULL,
    requested_by uuid REFERENCES auth.users(id),
    priority integer NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    max_attempts integer NOT NULL DEFAULT 3,
    attempt_count integer NOT NULL DEFAULT 0,
    last_attempt_at timestamptz,
    next_attempt_at timestamptz,
    error_log text[],
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_retry_queue_status ON pipeline_retry_queue(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_pipeline_retry_queue_original ON pipeline_retry_queue(job_type, original_job_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_pipeline_retry_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_pipeline_retry_queue_updated_at ON pipeline_retry_queue;
CREATE TRIGGER update_pipeline_retry_queue_updated_at
    BEFORE UPDATE ON pipeline_retry_queue
    FOR EACH ROW EXECUTE FUNCTION update_pipeline_retry_queue_updated_at();

COMMENT ON TABLE pipeline_retry_queue IS 'Queue for manual retry of failed ETL pipeline jobs.';
COMMENT ON COLUMN pipeline_retry_queue.priority IS '1=highest, 10=lowest. Used for processing order.';
COMMENT ON COLUMN pipeline_retry_queue.max_attempts IS 'Maximum retry attempts before marking failed.';

-- ============================================================================
-- 3. RLS Policies
-- ============================================================================

ALTER TABLE pipeline_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_retry_queue ENABLE ROW LEVEL SECURITY;

-- Admin/Staff can view all
CREATE POLICY "Admin view pipeline audit log" ON pipeline_audit_log FOR SELECT
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE POLICY "Admin view retry queue" ON pipeline_retry_queue FOR SELECT
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

-- Admin/Staff can manage retry queue
CREATE POLICY "Admin manage retry queue" ON pipeline_retry_queue FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

-- Service role can insert audit entries
CREATE POLICY "Service role insert audit log" ON pipeline_audit_log FOR INSERT
    WITH CHECK (true);

-- Service role can update retry status
CREATE POLICY "Service role update retry queue" ON pipeline_retry_queue FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 4. Helper Function: Get retry history for a job
-- ============================================================================

CREATE OR REPLACE FUNCTION get_job_retry_history(p_job_type text, p_job_id uuid)
RETURNS TABLE (
    retry_id uuid,
    status text,
    attempt_count integer,
    retry_reason text,
    error_log text[],
    created_at timestamptz,
    last_attempt_at timestamptz
) AS $$
    SELECT
        prq.id,
        prq.status,
        prq.attempt_count,
        prq.retry_reason,
        prq.error_log,
        prq.created_at,
        prq.last_attempt_at
    FROM pipeline_retry_queue prq
    WHERE prq.job_type = p_job_type
    AND prq.original_job_id = p_job_id
    ORDER BY prq.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_job_retry_history IS 'Returns all retry attempts for a specific job.';

-- ============================================================================
-- 5. Helper Function: Get pending retries for processing
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_retries(p_limit integer DEFAULT 10)
RETURNS TABLE (
    retry_id uuid,
    job_type text,
    original_job_id uuid,
    retry_reason text,
    priority integer,
    attempt_count integer
) AS $$
    SELECT
        prq.id,
        prq.job_type,
        prq.original_job_id,
        prq.retry_reason,
        prq.priority,
        prq.attempt_count
    FROM pipeline_retry_queue prq
    WHERE prq.status = 'pending'
    AND (prq.next_attempt_at IS NULL OR prq.next_attempt_at <= NOW())
    AND prq.attempt_count < prq.max_attempts
    ORDER BY prq.priority DESC, prq.created_at ASC
    LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_pending_retries IS 'Returns pending retries ready for processing, ordered by priority.';

COMMIT;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON INDEX idx_pipeline_audit_job IS 'Fast lookup of audit history by job.';
COMMENT ON INDEX idx_pipeline_retry_queue_status IS 'Fast lookup of retryable jobs by status.';
