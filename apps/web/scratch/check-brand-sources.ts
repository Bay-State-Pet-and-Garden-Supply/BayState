import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Fetching products in extracting status...');
  const { data: products, error } = await supabase
    .from('products_ingestion')
    .select('sku, pipeline_status, brand_id')
    .eq('pipeline_status', 'extracting');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  if (!products || products.length === 0) {
    console.log('No products in extracting status.');
    return;
  }

  console.log(`Found ${products.length} products in extracting status.`);
  
  const brandIds = [...new Set(products.map(p => p.brand_id).filter(Boolean) as string[])];
  console.log('Unique brand IDs in extracting products:', brandIds);

  if (brandIds.length === 0) {
    console.log('None of these products have a brand_id set!');
    return;
  }

  // Fetch brands
  const { data: brands } = await supabase
    .from('brands')
    .select('id, name, slug')
    .in('id', brandIds);

  console.log('Assigned Brands:', brands);

  // Fetch brand sources
  const { data: sources } = await supabase
    .from('brand_sources')
    .select('brand_id, source_type, source_slug, enabled, priority')
    .in('brand_id', brandIds);

  console.log('Configured Brand Sources:', sources);
}

check();
