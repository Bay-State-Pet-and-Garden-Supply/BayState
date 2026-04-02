
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function debug() {
  const { data, error } = await supabase
    .from('products_ingestion')
    .select('pipeline_status')
    .limit(10);

  if (error) {
    console.error('Error fetching pipeline_status:', error);
    return;
  }

  console.log('Status values found:', Array.from(new Set(data.map(d => d.pipeline_status))));
}

debug();
