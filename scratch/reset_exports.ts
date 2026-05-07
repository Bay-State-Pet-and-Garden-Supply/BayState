import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://fapnuczapctelxxmrail.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcG51Y3phcGN0ZWx4eG1yYWlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc0MzcxOCwiZXhwIjoyMDgxMzE5NzE4fQ.-X_NU9wDFA5RwfQQ7oWrrorW_b9h_TSfGldtnrmqG2g";

async function resetTodaysExports() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Find products exported today (in Eastern Time)
    // The user's local time is 2026-05-07T16:04:15-04:00.
    // We want to reset everything exported on 2026-05-07.
    const todayStr = '2026-05-07';
    
    console.log(`Searching for products exported on ${todayStr}...`);
    
    const { data, error } = await supabase
        .from('products_ingestion')
        .select('sku, exported_at')
        .gte('exported_at', `${todayStr}T00:00:00Z`);
        
    if (error) {
        console.error('Error fetching products:', error);
        return;
    }
    
    if (!data || data.length === 0) {
        console.log('No products found exported today.');
        return;
    }
    
    console.log(`Found ${data.length} products. Resetting exported_at...`);
    
    const skus = data.map(p => p.sku);
    
    const { error: updateError } = await supabase
        .from('products_ingestion')
        .update({ exported_at: null })
        .in('sku', skus);
        
    if (updateError) {
        console.error('Error updating products ingestion:', updateError);
    } else {
        console.log('Successfully reset exported_at in products_ingestion for:', skus.length, 'products');
    }

    // Also check if they were published to 'products' table and cleanup if needed
    // Actually, it's safer to leave them in 'products' but we want them back in 'exporting'
}

resetTodaysExports().catch(console.error);
