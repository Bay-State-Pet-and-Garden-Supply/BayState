import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from apps/web/.env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listProducts() {
  console.log('=== Active Products Ingested ===\n');

  const { data: products, error } = await supabase
    .from('products_ingestion')
    .select('sku, pipeline_status, brand_id, enrichment_config, updated_at')
    .limit(20);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Fetched ${products?.length || 0} products:`);
  console.log(JSON.stringify(products, null, 2));
}

listProducts();
