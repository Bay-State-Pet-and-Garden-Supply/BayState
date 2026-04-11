import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: statusCounts } = await supabase.from('products_ingestion').select('pipeline_status');
  if (!statusCounts) return;
  
  const counts: Record<string, number> = {};
  statusCounts.forEach(r => {
    const s = r.pipeline_status || 'null';
    counts[s] = (counts[s] || 0) + 1;
  });
  
  console.log('Ingestion Status Counts:', counts);
}

check();
