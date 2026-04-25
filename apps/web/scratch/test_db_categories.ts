import { createClient } from '@supabase/supabase-js';
import { getMappedCategorySlug } from '../lib/facets/category-mapping';

const supabaseUrl = "https://fapnuczapctelxxmrail.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcG51Y3phcGN0ZWx4eG1yYWlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc0MzcxOCwiZXhwIjoyMDgxMzE5NzE4fQ.-X_NU9wDFA5RwfQQ7oWrrorW_b9h_TSfGldtnrmqG2g";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
    const { data, error } = await supabase
        .from('products_ingestion')
        .select('sku, input')
        .limit(1000);

    if (error) {
        console.error("DB Error:", error);
        return;
    }

    console.log(`Found ${data.length} records`);
    let count = 0;
    for (const row of data) {
        const input = row.input as any;
        const cat = input.categoryName;
        const type = input.productTypeName;
        
        console.log(`\nSKU: ${row.sku}`);
        console.log(`Category: ${cat} | Type: ${type}`);
        
        if (cat) {
            count++;
            const mapped = getMappedCategorySlug(cat, type);
            console.log(`Mapped: ${mapped}`);
        }
    }
    console.log(`Total with category: ${count}`);
}

main();