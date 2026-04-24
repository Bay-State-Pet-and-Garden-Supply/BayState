import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getLocalScraperConfig } from "@/lib/admin/scrapers/configs";

/**
 * POST /api/admin/scrapers/test
 *
 * Queues a test job for a scraper configuration.
 *
 * Request Body:
 * {
 *   scraper_id: string;
 *   type: "test" | "fake";
 * }
 *
 * Response (200):
 * {
 *   job_id: string;
 *   status: "queued";
 * }
 *
 * Errors:
 * - 403: User is not admin or staff
 * - 400: Invalid request body or scraper has no test_assertions
 * - 404: Scraper not found
 */

const testJobSchema = z.object({
  scraper_id: z.string().min(1, "scraper_id is required"),
  type: z.enum(["test", "fake"]),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth();
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await request.json();
    const parseResult = testJobSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { scraper_id, type } = parseResult.data;

    const supabase = await createClient();

    const { data: scraper, error: scraperError } = await supabase
      .from("scraper_configs")
      .select("id, slug, display_name")
      .or(`slug.eq.${scraper_id},id.eq.${scraper_id}`)
      .single();

    if (scraperError || !scraper) {
      return NextResponse.json(
        { error: "Scraper not found" },
        { status: 404 }
      );
    }

    const localConfig = await getLocalScraperConfig(scraper.slug);
    if (!localConfig) {
      return NextResponse.json(
        { error: "Scraper config file not found" },
        { status: 404 }
      );
    }

    const testAssertions = localConfig.config.test_assertions;
    if (
      !testAssertions ||
      (Array.isArray(testAssertions) && testAssertions.length === 0)
    ) {
      return NextResponse.json(
        { error: "Scraper has no test_assertions defined" },
        { status: 400 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("scrape_jobs")
      .insert({
        config_id: scraper.id,
        status: "pending",
        job_type: type,
        test_metadata: {
          config_id: scraper.id,
          test_type: type,
        },
      })
      .select("id, status")
      .single();

    if (jobError || !job) {
      console.error("[Scraper Test API] Error creating job:", jobError);
      return NextResponse.json(
        { error: "Failed to create test job" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      job_id: job.id,
      status: "queued",
    });
  } catch (error) {
    console.error("[Scraper Test API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
