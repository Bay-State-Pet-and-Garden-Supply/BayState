-- Fix Security Definer Views
ALTER VIEW public.pipeline_finalizing_queue SET (security_invoker = true);
ALTER VIEW public.dashboard_migration_progress SET (security_invoker = true);
ALTER VIEW public.admin_orders_list SET (security_invoker = true);
ALTER VIEW public.dashboard_order_stats SET (security_invoker = true);
ALTER VIEW public.pipeline_finalized_review SET (security_invoker = true);
ALTER VIEW public.pipeline_export_queue SET (security_invoker = true);
ALTER VIEW public.dashboard_product_stats SET (security_invoker = true);
ALTER VIEW public.dashboard_scraper_stats SET (security_invoker = true);
ALTER VIEW public.products_published SET (security_invoker = true);

-- Enable RLS on affected tables
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopsite_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preorder_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preorder_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_preorder_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;

-- Admin Only ALL
CREATE POLICY "Admin manage shopsite_credentials" ON public.shopsite_credentials FOR ALL TO authenticated USING (is_admin());

-- Staff Only ALL
CREATE POLICY "Staff manage order_events" ON public.order_events FOR ALL TO authenticated USING (is_staff());
CREATE POLICY "Staff manage order_source_records" ON public.order_source_records FOR ALL TO authenticated USING (is_staff());
CREATE POLICY "Staff manage inventory_reconciliation" ON public.inventory_reconciliation FOR ALL TO authenticated USING (is_staff());
CREATE POLICY "Staff manage inventory_reconciliation_items" ON public.inventory_reconciliation_items FOR ALL TO authenticated USING (is_staff());
CREATE POLICY "Staff manage promo_codes" ON public.promo_codes FOR ALL TO authenticated USING (is_staff());
CREATE POLICY "Staff manage promo_redemptions" ON public.promo_redemptions FOR ALL TO authenticated USING (is_staff());
CREATE POLICY "Staff manage b2b_feeds" ON public.b2b_feeds FOR ALL TO authenticated USING (is_staff());
CREATE POLICY "Staff manage ai_provider_configs" ON public.ai_provider_configs FOR ALL TO authenticated USING (is_staff());

-- Public Read / Staff Manage
CREATE POLICY "Public read inventory_items" ON public.inventory_items FOR SELECT TO public USING (true);
CREATE POLICY "Staff manage inventory_items" ON public.inventory_items FOR ALL TO authenticated USING (is_staff());

CREATE POLICY "Public read preorder_groups" ON public.preorder_groups FOR SELECT TO public USING (true);
CREATE POLICY "Staff manage preorder_groups" ON public.preorder_groups FOR ALL TO authenticated USING (is_staff());

CREATE POLICY "Public read preorder_batches" ON public.preorder_batches FOR SELECT TO public USING (true);
CREATE POLICY "Staff manage preorder_batches" ON public.preorder_batches FOR ALL TO authenticated USING (is_staff());

CREATE POLICY "Public read product_preorder_groups" ON public.product_preorder_groups FOR SELECT TO public USING (true);
CREATE POLICY "Staff manage product_preorder_groups" ON public.product_preorder_groups FOR ALL TO authenticated USING (is_staff());

CREATE POLICY "Public read brand_sources" ON public.brand_sources FOR SELECT TO public USING (true);
CREATE POLICY "Staff manage brand_sources" ON public.brand_sources FOR ALL TO authenticated USING (is_staff());

CREATE POLICY "Public read product_types" ON public.product_types FOR SELECT TO public USING (true);
CREATE POLICY "Staff manage product_types" ON public.product_types FOR ALL TO authenticated USING (is_staff());
