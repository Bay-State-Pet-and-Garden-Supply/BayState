import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count: productsCount, error: productsError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  const { count: ingestionCount, error: ingestionError } = await supabase
    .from('products_ingestion')
    .select('*', { count: 'exact', head: true });

  console.log('Products count:', productsCount);
  console.log('Ingestion count:', ingestionCount);

  if (productsError) console.error('Products error:', productsError);
  if (ingestionError) console.error('Ingestion error:', ingestionError);

  // If RPC doesn't exist, try a manual check for first few
  const { data: sampleProducts } = await supabase.from('products').select('sku').limit(20);
  if (sampleProducts) {
      const skus = sampleProducts.map(p => p.sku);
      const { data: ingestionProducts } = await supabase.from('products_ingestion').select('sku').in('sku', skus);
      const ingestionSkus = new Set(ingestionProducts?.map(p => p.sku) || []);
      const missing = skus.filter(s => !ingestionSkus.has(s));
      console.log('Sample missing in ingestion (of first 20):', missing);
  }
}

check();
