import { createClient } from "@supabase/supabase-js";
import { buildApprovedSourcePlans } from "../lib/approved-sources/source-plan";

const supabase = createClient("http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY || "");

async function main() {
  const targetSku = "051588001422";
  console.log(`🎯 Preparing local E2E enrichment run for SKU: ${targetSku}...`);

  // 1. Verify product exists
  const { data: product, error: pError } = await supabase
    .from("products_ingestion")
    .select("sku, pipeline_status, brand_id")
    .eq("sku", targetSku)
    .single();

  if (pError || !product) {
    console.error("❌ Product not found or error:", pError);
    return;
  }
  console.log(`✅ Product verified locally: SKU ${product.sku}, status ${product.pipeline_status}, brand_id ${product.brand_id}`);

  // 2. Build the approved source plan
  console.log("📋 Building approved source plan...");
  const plans = await buildApprovedSourcePlans(supabase, [targetSku]);
  const result = plans[targetSku];

  if (!result || !result.ok) {
    console.error("❌ Failed to build source plan:", result?.error ?? "Unknown error");
    return;
  }

  const plan = result.plan;
  console.log("✅ Successfully built source plan:", JSON.stringify(plan, null, 2));

  // 3. Create enrichment_jobs row
  console.log("🚀 Creating enrichment job...");
  const { data: job, error: jobError } = await supabase
    .from("enrichment_jobs")
    .insert({
      status: "queued",
      skus: [targetSku],
      total_count: 1,
      completed_count: 0,
      failed_count: 0,
      model: "google/gemma-4-e4b",
      mode: "mixed",
      config: {
        source_plans_by_sku: {
          [targetSku]: plan
        },
        source_type: "approved_source_extraction"
      }
    })
    .select()
    .single();

  if (jobError || !job) {
    console.error("❌ Failed to create enrichment job:", jobError);
    return;
  }
  console.log(`✅ Enrichment job created! Job ID: ${job.id}`);

  // 4. Create enrichment_attempts row
  console.log("🚀 Creating enrichment attempt...");
  const { data: attempt, error: attemptError } = await supabase
    .from("enrichment_attempts")
    .insert({
      job_id: job.id,
      sku: targetSku,
      attempt_number: 1,
      status: "queued",
      mode: "mixed",
      model: "google/gemma-4-e4b",
      source_url: null
    })
    .select()
    .single();

  if (attemptError || !attempt) {
    console.error("❌ Failed to create enrichment attempt:", attemptError);
    // Clean up job
    await supabase.from("enrichment_jobs").delete().eq("id", job.id);
    return;
  }
  console.log(`✅ Enrichment attempt created! Attempt ID: ${attempt.id}`);

  // 5. Update product pipeline status
  console.log("📝 Updating product pipeline status to 'extracting'...");
  const { error: updateError } = await supabase
    .from("products_ingestion")
    .update({
      pipeline_status: "extracting",
      updated_at: new Date().toISOString(),
    })
    .eq("sku", targetSku);

  if (updateError) {
    console.warn("⚠️ Warning: Failed to update products_ingestion status:", updateError);
  } else {
    console.log("✅ Product pipeline status updated successfully!");
  }

  console.log("\n🎉 E2E local enrichment job successfully queued!");
  console.log(`Monitor the scraper daemon logs in the background to watch it claim and execute!`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
});
