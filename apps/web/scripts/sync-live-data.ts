import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// =============================================================================
// Configuration
// =============================================================================

const LIVE_URL = "https://fapnuczapctelxxmrail.supabase.co";
const LIVE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || "";

const LOCAL_URL = "http://127.0.0.1:54321";

function getLocalServiceKey(): string {
  if (process.env.SUPABASE_LOCAL_SERVICE_KEY) {
    return process.env.SUPABASE_LOCAL_SERVICE_KEY;
  }
  const pathsToSearch = [
    path.resolve(process.cwd(), "apps/web/.env.local"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(__dirname, "../.env.local"),
    path.resolve(__dirname, "../../.env.local")
  ];
  for (const envPath of pathsToSearch) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        const match = content.match(/^SUPABASE_SECRET_KEY\s*=\s*(sb_secret_[a-zA-Z0-9_-]+)$/m);
        if (match) {
          return match[1].trim();
        }
      }
    } catch (e) {
      // Ignored
    }
  }
  return "";
}

const LOCAL_SERVICE_KEY = getLocalServiceKey();

if (!LIVE_SERVICE_KEY) {
  console.error("❌ Error: SUPABASE_SECRET_KEY environment variable is required.");
  console.error("Please run the command as: SUPABASE_SECRET_KEY=YOUR_SECRET_KEY bun run apps/web/scripts/sync-live-data.ts");
  process.exit(1);
}

if (!LOCAL_SERVICE_KEY) {
  console.error("❌ Error: Could not resolve local Supabase service role key. Please ensure apps/web/.env.local exists or provide SUPABASE_LOCAL_SERVICE_KEY.");
  process.exit(1);
}

// Create Clients
const liveSupabase = createClient(LIVE_URL, LIVE_SERVICE_KEY, {
  auth: { persistSession: false },
});
const localSupabase = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log("🚀 Starting comprehensive data sync from Live to Local Supabase...");

  try {
    // -------------------------------------------------------------------------
    // 0. Purge Local Database Tables in correct dependency order
    // -------------------------------------------------------------------------
    console.log("\n🧹 Purging conflicting local development tables...");

    const dummyUuid = "00000000-0000-0000-0000-000000000000";

    const { error: delTargetsErr } = await localSupabase
      .from("enrichment_targets")
      .delete()
      .neq("id", dummyUuid);
    if (delTargetsErr) console.warn("⚠️ Warning deleting targets:", delTargetsErr.message);

    const { error: delProductsErr } = await localSupabase
      .from("products_ingestion")
      .delete()
      .neq("sku", "");
    if (delProductsErr) console.warn("⚠️ Warning deleting products:", delProductsErr.message);

    const { error: delCohortsErr } = await localSupabase
      .from("cohort_batches")
      .delete()
      .neq("id", dummyUuid);
    if (delCohortsErr) console.warn("⚠️ Warning deleting cohorts:", delCohortsErr.message);

    const { error: delBrandsErr } = await localSupabase
      .from("brands")
      .delete()
      .neq("id", dummyUuid);
    if (delBrandsErr) console.warn("⚠️ Warning deleting brands:", delBrandsErr.message);

    const { error: delApiKeysErr } = await localSupabase
      .from("runner_api_keys")
      .delete()
      .neq("id", dummyUuid);
    if (delApiKeysErr) console.warn("⚠️ Warning deleting runner API keys:", delApiKeysErr.message);

    const { error: delRunnersErr } = await localSupabase
      .from("scraper_runners")
      .delete()
      .neq("name", "");
    if (delRunnersErr) console.warn("⚠️ Warning deleting scraper runners:", delRunnersErr.message);

    const { error: delCredsErr } = await localSupabase
      .from("scraper_credentials")
      .delete()
      .neq("id", dummyUuid);
    if (delCredsErr) console.warn("⚠️ Warning deleting credentials:", delCredsErr.message);

    console.log("✅ Local tables purged and ready for clean sync!");

    // -------------------------------------------------------------------------
    // 1. Sync Catalog Brands
    // -------------------------------------------------------------------------
    console.log("\n🏷️ Syncing table 'brands'...");
    const { data: brands, error: brandsErr } = await liveSupabase
      .from("brands")
      .select("*");

    if (brandsErr) throw brandsErr;
    console.log(`Fetched ${brands?.length ?? 0} brands from live.`);

    if (brands && brands.length > 0) {
      const { error: localBrandsErr } = await localSupabase
        .from("brands")
        .upsert(brands);
      if (localBrandsErr) throw localBrandsErr;
      console.log("✅ Successfully upserted brands locally.");
    }

    // -------------------------------------------------------------------------
    // 2. Sync Cohort Batches
    // -------------------------------------------------------------------------
    console.log("\n📦 Syncing table 'cohort_batches'...");
    const { data: cohorts, error: cohortsErr } = await liveSupabase
      .from("cohort_batches")
      .select("*");

    if (cohortsErr) throw cohortsErr;
    console.log(`Fetched ${cohorts?.length ?? 0} cohort batches from live.`);

    if (cohorts && cohorts.length > 0) {
      const { error: localCohortsErr } = await localSupabase
        .from("cohort_batches")
        .upsert(cohorts);
      if (localCohortsErr) throw localCohortsErr;
      console.log("✅ Successfully upserted cohort batches locally.");
    }

    // -------------------------------------------------------------------------
    // 3. Sync Scraper Runners
    // -------------------------------------------------------------------------
    console.log("\n🤖 Syncing table 'scraper_runners'...");
    const { data: runners, error: runnersErr } = await liveSupabase
      .from("scraper_runners")
      .select("*");

    if (runnersErr) throw runnersErr;
    console.log(`Fetched ${runners?.length ?? 0} runners from live.`);

    if (runners && runners.length > 0) {
      const cleanedRunners = runners.map(r => ({
        ...r,
        current_job_id: null
      }));
      const { error: localRunnersErr } = await localSupabase
        .from("scraper_runners")
        .upsert(cleanedRunners);
      if (localRunnersErr) throw localRunnersErr;
      console.log("✅ Successfully upserted scraper runners locally.");
    }

    // -------------------------------------------------------------------------
    // 4. Sync Scraper Runner API Keys
    // -------------------------------------------------------------------------
    console.log("\n🔑 Syncing table 'runner_api_keys'...");
    const { data: apiKeys, error: apiKeysErr } = await liveSupabase
      .from("runner_api_keys")
      .select("*");

    if (apiKeysErr) throw apiKeysErr;
    console.log(`Fetched ${apiKeys?.length ?? 0} runner API keys from live.`);

    if (apiKeys && apiKeys.length > 0) {
      const cleanedApiKeys = apiKeys.map(k => ({
        ...k,
        created_by: null
      }));
      const { error: localApiKeysErr } = await localSupabase
        .from("runner_api_keys")
        .upsert(cleanedApiKeys);
      if (localApiKeysErr) throw localApiKeysErr;
      console.log("✅ Successfully upserted runner API keys locally.");
    }

    // -------------------------------------------------------------------------
    // 5. Sync Scraper Credentials
    // -------------------------------------------------------------------------
    console.log("\n🔐 Syncing table 'scraper_credentials'...");
    const { data: credentials, error: credentialsErr } = await liveSupabase
      .from("scraper_credentials")
      .select("*");

    if (credentialsErr) throw credentialsErr;
    console.log(`Fetched ${credentials?.length ?? 0} encrypted credentials from live.`);

    if (credentials && credentials.length > 0) {
      const cleanedCreds = credentials.map(c => ({
        ...c,
        updated_by: null
      }));
      const { error: localCredsErr } = await localSupabase
        .from("scraper_credentials")
        .upsert(cleanedCreds);
      if (localCredsErr) throw localCredsErr;
      console.log("✅ Successfully upserted credentials locally.");
    }

    // -------------------------------------------------------------------------
    // 6. Sync active products from products_ingestion (up to 500 items)
    // -------------------------------------------------------------------------
    console.log("\n🍎 Syncing active products from 'products_ingestion'...");
    const { data: activeProducts, error: productsErr } = await liveSupabase
      .from("products_ingestion")
      .select("*")
      .in("pipeline_status", ["imported", "awaiting_brand", "extracting", "processed", "merging", "reviewing", "failed"])
      .order("updated_at", { ascending: false })
      .limit(500);

    if (productsErr) throw productsErr;
    console.log(`Fetched ${activeProducts?.length ?? 0} active products from live across pipeline stages.`);

    if (activeProducts && activeProducts.length > 0) {
      const { error: localProductsErr } = await localSupabase
        .from("products_ingestion")
        .upsert(activeProducts);
      if (localProductsErr) throw localProductsErr;
      console.log(`✅ Successfully upserted ${activeProducts.length} active products locally.`);

      // -------------------------------------------------------------------------
      // 7. Sync active enrichment targets for these products
      // -------------------------------------------------------------------------
      const activeSkus = activeProducts.map(p => p.sku);
      console.log("\n🎯 Syncing active enrichment targets...");
      
      const batchSize = 100;
      let allTargets: any[] = [];
      
      for (let i = 0; i < activeSkus.length; i += batchSize) {
        const chunk = activeSkus.slice(i, i + batchSize);
        const { data: targetsChunk, error: targetsErr } = await liveSupabase
          .from("enrichment_targets")
          .select("*")
          .in("sku", chunk);
          
        if (targetsErr) throw targetsErr;
        allTargets = allTargets.concat(targetsChunk || []);
      }
      
      console.log(`Fetched ${allTargets.length} targets related to active SKUs from live.`);

      if (allTargets.length > 0) {
        const { error: localTargetsErr } = await localSupabase
          .from("enrichment_targets")
          .upsert(allTargets);
        if (localTargetsErr) throw localTargetsErr;
        console.log(`✅ Successfully upserted ${allTargets.length} enrichment targets locally.`);
      }
    }

    console.log("\n🎉 Live to Local Supabase sync complete!");
    console.log("💡 You can now safely test standard and approved source extraction locally with real SKU data and credentials!");

  } catch (err) {
    console.error("\n❌ Error during Supabase data synchronization:", err);
    process.exit(1);
  }
}

main();
