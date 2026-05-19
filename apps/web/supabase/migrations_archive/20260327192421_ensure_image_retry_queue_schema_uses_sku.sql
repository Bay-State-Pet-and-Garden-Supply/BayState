-- Ensure image_retry_queue exists and uses sku-based foreign keys.
-- This migration handles both:
-- 1) fresh environments where image_retry_queue does not exist
-- 2) legacy environments where image_retry_queue still has product_id (uuid)

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'image_error_type') THEN
    CREATE TYPE image_error_type AS ENUM (
      'auth_401',
      'not_found_404',
      'network_timeout',
      'cors_blocked',
      'unknown'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'image_retry_status') THEN
    CREATE TYPE image_retry_status AS ENUM (
      'pending',
      'processing',
      'completed',
      'failed'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.image_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text REFERENCES public.products_ingestion(sku) ON DELETE CASCADE,
  image_url text NOT NULL,
  error_type image_error_type NOT NULL DEFAULT 'unknown',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  status image_retry_status NOT NULL DEFAULT 'pending',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'image_retry_queue'
      AND column_name = 'product_id'
  ) THEN
    ALTER TABLE public.image_retry_queue DROP CONSTRAINT IF EXISTS image_retry_queue_product_id_fkey;
    DELETE FROM public.image_retry_queue WHERE product_id IS NOT NULL;
    ALTER TABLE public.image_retry_queue RENAME COLUMN product_id TO sku;
    ALTER TABLE public.image_retry_queue ALTER COLUMN sku TYPE text USING sku::text;
  END IF;
END
$$;

ALTER TABLE public.image_retry_queue DROP CONSTRAINT IF EXISTS image_retry_queue_sku_fkey;
ALTER TABLE public.image_retry_queue
  ADD CONSTRAINT image_retry_queue_sku_fkey
  FOREIGN KEY (sku) REFERENCES public.products_ingestion(sku) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_image_retry_queue_status ON public.image_retry_queue(status);
CREATE INDEX IF NOT EXISTS idx_image_retry_queue_error_type ON public.image_retry_queue(error_type);
CREATE INDEX IF NOT EXISTS idx_image_retry_queue_scheduled ON public.image_retry_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_image_retry_queue_sku ON public.image_retry_queue(sku);
CREATE INDEX IF NOT EXISTS idx_image_retry_queue_processing
  ON public.image_retry_queue(status, scheduled_for, retry_count, max_retries)
  WHERE status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.update_image_retry_queue_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_image_retry_queue_updated_at ON public.image_retry_queue;
CREATE TRIGGER update_image_retry_queue_updated_at
  BEFORE UPDATE ON public.image_retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_image_retry_queue_updated_at();

CREATE OR REPLACE FUNCTION public.get_pending_image_retries(p_limit integer DEFAULT 10)
RETURNS TABLE (
  retry_id uuid,
  sku text,
  image_url text,
  error_type image_error_type,
  retry_count integer,
  max_retries integer,
  last_error text
) AS $$
  SELECT
    irq.id,
    irq.sku,
    irq.image_url,
    irq.error_type,
    irq.retry_count,
    irq.max_retries,
    irq.last_error
  FROM public.image_retry_queue irq
  WHERE irq.status = 'pending'
    AND irq.scheduled_for <= now()
    AND irq.retry_count < irq.max_retries
  ORDER BY irq.scheduled_for ASC, irq.retry_count ASC
  LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_product_image_retry_history(p_sku text)
RETURNS TABLE (
  retry_id uuid,
  image_url text,
  error_type image_error_type,
  retry_count integer,
  status image_retry_status,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
  SELECT
    irq.id,
    irq.image_url,
    irq.error_type,
    irq.retry_count,
    irq.status,
    irq.created_at,
    irq.updated_at
  FROM public.image_retry_queue irq
  WHERE irq.sku = p_sku
  ORDER BY irq.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMIT;
