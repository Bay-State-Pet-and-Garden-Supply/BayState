const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
  process.exit(1);
}

const endpoint = new URL(`${supabaseUrl}/rest/v1/site_settings`);
endpoint.searchParams.set('key', 'eq.scraper_runner_release_latest');

const response = await fetch(endpoint, {
  method: 'GET',
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  },
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Failed to check runner release metadata: ${response.status} ${body}`);
}

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
