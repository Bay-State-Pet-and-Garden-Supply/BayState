
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual .env loading to avoid dependencies
const envPath = path.resolve(__dirname, '../.env.local');
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const val = valueParts.join('=').trim().replace(/^["']|["']$/g, ''); // strip quotes
      if (key.trim() === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = val;
      if (key.trim() === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = val;
    }
  });
}

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyAdmin() {
  const email = 'nvborrello@gmail.com';
  console.log(`Checking profile for ${email}...`);

  // Check Profile & Role
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('email', email);

  if (error) {
    console.error('❌ Error fetching profile:', error.message);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.error('❌ Profile NOT FOUND.');
    return;
  }

  const profile = profiles[0];
  console.log('✅ Profile Found:', profile);

  if (profile.role === 'admin') {
    console.log('🎉 SUCCESS: Role is ADMIN.');
  } else {
    console.error(`❌ FAILURE: Role is '${profile.role}'.`);
  }

  // Check Schema Columns (Task 5 Verification)
  console.log('\nChecking Schema Completeness...');
  // We can't query information_schema easily via JS client without RPC.
  // Instead, we try to select the specific columns and see if it errors.
  const { error: colError } = await supabase
    .from('profiles')
    .select('phone, preferences, legacy_customer_id, first_order_completed')
    .limit(1);

  if (colError) {
    console.error('⚠️ POTENTIAL SCHEMA ISSUE:', colError.message);
    console.log('👉 You likely need to run BayStateApp/fix_profiles_schema.sql');
  } else {
    console.log('✅ Schema looks complete (columns exist).');
  }
}

verifyAdmin();
