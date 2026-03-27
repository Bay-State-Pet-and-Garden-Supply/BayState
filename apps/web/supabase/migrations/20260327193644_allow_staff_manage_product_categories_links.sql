-- Ensure admin/staff users can manage product_categories through publish flow.
-- requireAdminAuth checks profile role, while older RLS policy depended on JWT claims.

BEGIN;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/Staff Write Product Categories" ON public.product_categories;
CREATE POLICY "Admin/Staff Write Product Categories"
ON public.product_categories
FOR ALL
TO public
USING (is_staff())
WITH CHECK (is_staff());

COMMIT;
