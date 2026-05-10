-- Drop policies that conflict with recovery migration recreation
DROP POLICY IF EXISTS "Public read preorder groups" ON public.preorder_groups;
DROP POLICY IF EXISTS "Public read preorder batches" ON public.preorder_batches;
DROP POLICY IF EXISTS "Public read product preorder groups" ON public.product_preorder_groups;
DROP POLICY IF EXISTS "Admin manage preorder groups" ON public.preorder_groups;
DROP POLICY IF EXISTS "Admin manage preorder batches" ON public.preorder_batches;
DROP POLICY IF EXISTS "Admin manage product preorder groups" ON public.product_preorder_groups;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can view all order items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can view payments" ON public.order_payments;
DROP POLICY IF EXISTS "System can insert payments" ON public.order_payments;
