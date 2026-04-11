import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count: totalCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: publishedCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).not('published_at', 'is', null);
  
  console.log('Total products in storefront:', totalCount);
  console.log('Published products in storefront (published_at NOT NULL):', publishedCount);
}

check();
