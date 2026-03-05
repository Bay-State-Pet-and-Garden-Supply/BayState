/**
 * Seed test fixtures for accessibility tests
 * Run: node supabase/seed-a11y-tests.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function seedTestData() {
  console.log('Seeding accessibility test fixtures...');
  
  try {
    // 1. Create test brand
    console.log('Creating test brand...');
    await supabase.from('brands').upsert({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Test Brand',
      slug: 'test-brand',
      logo_url: null
    }, { onConflict: 'slug' });
    
    // 2. Create test product
    console.log('Creating test product...');
    await supabase.from('products').upsert({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      brand_id: '11111111-1111-1111-1111-111111111111',
      name: 'Test Product for Accessibility Testing',
      slug: 'test-product',
      description: 'Test product for a11y tests',
      price: 29.99,
      stock_status: 'in_stock',
      images: ['https://placehold.co/400x400/png'],
      is_featured: true
    }, { onConflict: 'slug' });
    
    // 3. Create test service
    console.log('Creating test service...');
    await supabase.from('services').upsert({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'Propane Refill',
      slug: 'propane-refill',
      description: 'Propane tank refill',
      price: 15.99,
      unit: 'per tank',
      is_active: true
    }, { onConflict: 'slug' });
    
    // 4. Create test order
    console.log('Creating test order...');
    await supabase.from('orders').upsert({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      order_number: 'BSP-20260115-0001',
      customer_name: 'Test Customer',
      customer_email: 'test@example.com',
      status: 'completed',
      subtotal: 29.99,
      tax: 1.87,
      total: 31.86
    }, { onConflict: 'id' });
    
    // 5. Create order item
    console.log('Creating order item...');
    await supabase.from('order_items').upsert({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      order_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      item_type: 'product',
      item_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      item_name: 'Test Product',
      item_slug: 'test-product',
      quantity: 1,
      unit_price: 29.99,
      total_price: 29.99
    }, { onConflict: 'id' });
    
    console.log('Test fixtures seeded!');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

seedTestData();
