import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: publishedSkus } = await supabase.from('products').select('sku');
  if (!publishedSkus) return;
  
  const skus = publishedSkus.map(p => p.sku);
  
  // Check in batches
  let found = 0;
  const batchSize = 1000;
  for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize);
      const { count } = await supabase.from('products_ingestion').select('*', { count: 'exact', head: true }).in('sku', batch);
      found += (count || 0);
  }
  
  console.log('Total Published products:', skus.length);
  console.log('Published products found in ingestion:', found);
}

check();
