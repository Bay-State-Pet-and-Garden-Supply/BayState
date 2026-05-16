import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetStuckProducts() {
  console.log('Finding "Fromm" brand...');
  const { data: frommBrands, error: fError } = await supabase
    .from('brands')
    .select('id, name')
    .eq('name', 'Fromm');

  if (fError) {
    console.error('Error fetching Fromm brand:', fError);
    return;
  }

  const frommBrandId = frommBrands?.[0]?.id;
  if (!frommBrandId) {
    console.error('Could not find brand with name "Fromm". Aborting to be safe.');
    return;
  }

  console.log(`Fromm brand ID is: ${frommBrandId}`);

  console.log('\nRunning database update to reset stuck non-Fromm products in "extracting"...');
  
  // Update query where status is extracting and brand_id is NOT Fromm's brand ID
  const { data: updatedRows, error: updateError, count } = await supabase
    .from('products_ingestion')
    .update({
      pipeline_status: 'imported',
      updated_at: new Date().toISOString()
    })
    .eq('pipeline_status', 'extracting')
    .neq('brand_id', frommBrandId)
    .select('sku, brand_id');

  if (updateError) {
    console.error('Error resetting products:', updateError);
    return;
  }

  console.log(`\nSuccessfully reset ${(updatedRows || []).length} products back to "imported"!`);
  
  if (updatedRows && updatedRows.length > 0) {
    // Map brand IDs to names for printing
    const { data: brands } = await supabase.from('brands').select('id, name');
    const brandMap = new Map<string, string>();
    brands?.forEach(b => brandMap.set(b.id, b.name));

    console.log('\nReset products summary:');
    const summary = updatedRows.map(r => ({
      sku: r.sku,
      brand: r.brand_id ? (brandMap.get(r.brand_id) || r.brand_id) : 'No Brand'
    }));
    console.table(summary);
  }
}

resetStuckProducts();
