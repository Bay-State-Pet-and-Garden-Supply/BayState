-- Superseded by 20260327192421_ensure_image_retry_queue_schema_uses_sku.
--
-- This migration originally assumed image_retry_queue already existed and could
-- fail on fresh environments where the base table had not yet been created.
-- It is intentionally left as a no-op to preserve migration history ordering.

BEGIN;
COMMIT;
