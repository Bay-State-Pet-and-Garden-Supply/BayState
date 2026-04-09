const supabaseUrl = 'https://fapnuczapcatelxxmrail.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcG51Y3phcGN0ZWx4eG1yYWlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc0MzcxOCwiZXhwIjoyMDgxMzE5NzE4fQ.-X_NU9wDFA5RwfQQ7oWrrorW_b9h_TSfGldtnrmqG2g';

const endpoint = new URL(`${supabaseUrl}/rest/v1/site_settings`);
endpoint.searchParams.set('key', 'eq.scraper_runner_release_latest');

const response = await fetch(endpoint, {
  method: 'GET',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  },
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Failed to check runner release metadata: ${response.status} ${body}`);
}

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
