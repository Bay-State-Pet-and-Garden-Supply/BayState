-- Track optional downstream ShopSite sync state for Supabase-first products.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shopsite_sync_status text NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS shopsite_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS shopsite_last_sync_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_shopsite_sync_status_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_shopsite_sync_status_check
      CHECK (shopsite_sync_status IN ('not_synced', 'pending', 'synced', 'failed'));
  END IF;
END $$;

COMMENT ON COLUMN public.products.shopsite_sync_status IS
  'Optional downstream ShopSite sync state for Supabase-first publishing.';

COMMENT ON COLUMN public.products.shopsite_last_synced_at IS
  'Timestamp of the last successful ShopSite upload for this storefront product.';

COMMENT ON COLUMN public.products.shopsite_last_sync_error IS
  'Last ShopSite sync error recorded while the product was pending downstream sync.';
