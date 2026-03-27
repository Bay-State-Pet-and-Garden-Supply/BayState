-- Fix publish trigger after sale_price column removal.
-- The products table no longer contains sale_price/compare_at_price,
-- so price history trigger must only compare price changes.
-- This migration is replay-safe: if public.price_history is absent, the
-- function still succeeds and simply skips history writes.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_product_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF OLD.price IS DISTINCT FROM NEW.price THEN
    IF to_regclass('public.price_history') IS NOT NULL THEN
      EXECUTE 'INSERT INTO public.price_history (product_id, price, compare_at_price, recorded_at) VALUES ($1, $2, $3, now())'
      USING NEW.id, NEW.price, NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
