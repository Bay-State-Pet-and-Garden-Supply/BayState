-- Add RLS policies for staff/admin to manage scraper runners
CREATE POLICY "Staff can manage scraper runners" ON "public"."scraper_runners"
FOR ALL
USING ("public"."is_staff"())
WITH CHECK ("public"."is_staff"());

-- Add RLS policies for staff/admin to manage runner API keys
CREATE POLICY "Staff can manage runner api keys" ON "public"."runner_api_keys"
FOR ALL
USING ("public"."is_staff"())
WITH CHECK ("public"."is_staff"());
