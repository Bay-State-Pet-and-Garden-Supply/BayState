import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCounts() {
  console.log('Checking product counts by status and brand...');
  
  const { data, error } = await supabase
    .from('products_ingestion')
    .select('pipeline_status, brand_id, exported_at', { count: 'exact' });

  if (error) {
    console.error('Error fetching counts:', error);
    return;
  }

  const counts: Record<string, number> = {};
  
  data.forEach((row: { pipeline_status: string; brand_id: string | null; exported_at: string | null }) => {
    const brandStatus = row.brand_id ? 'with_brand' : 'no_brand';
    const exportStatus = row.exported_at ? 'exported' : 'not_exported';
    const key = `${row.pipeline_status} | ${brandStatus} | ${exportStatus}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  console.table(Object.entries(counts).map(([key, count]) => {
    const [status, brand, exported] = key.split(' | ');
    return { status, brand, exported, count };
  }));
}

checkCounts();
