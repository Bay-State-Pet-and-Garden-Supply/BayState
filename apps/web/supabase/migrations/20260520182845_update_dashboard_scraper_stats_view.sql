-- Update dashboard_scraper_stats view to include completed_with_errors and all active statuses
CREATE OR REPLACE VIEW "public"."dashboard_scraper_stats" AS
 SELECT "count"(*) AS "total_jobs",
    "count"(*) FILTER (WHERE (("status" = 'completed'::"text") OR ("status" = 'completed_with_errors'::"text"))) AS "completed_jobs",
    "count"(*) FILTER (WHERE ("status" = 'failed'::"text")) AS "failed_jobs",
    "count"(*) FILTER (WHERE (("status" = 'running'::"text") OR ("status" = 'claimed'::"text") OR ("status" = 'pending'::"text") OR ("status" = 'queued'::"text"))) AS "active_jobs",
    "max"("created_at") AS "last_job_created"
   FROM "public"."enrichment_jobs"
  WHERE ("created_at" > ("now"() - '24:00:00'::interval));
