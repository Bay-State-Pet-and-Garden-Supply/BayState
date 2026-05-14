const required = [
  'SUPABASE_URL',
  'RUNNER_BUILD_ID',
  'RUNNER_BUILD_SHA',
  'RUNNER_IMAGE',
  'RUNNER_IMAGE_DIGEST',
];

for (const key of required) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Modern Supabase API keys (v2+) logic: prioritize keys starting with 'sb_'
const pickModernKey = (keys) => {
  return keys.find(k => k?.startsWith('sb_')) || keys.find(k => !!k) || '';
};

const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
const serviceRoleKey = pickModernKey([
  process.env.SUPABASE_SECRET_KEY,
  process.env.SUPABASE_SERVICE_ROLE_KEY
]);

if (!serviceRoleKey) {
  throw new Error('Missing Supabase secret key. Ensure SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is set.');
}
const releaseChannel = (process.env.RUNNER_RELEASE_CHANNEL || 'latest').trim().toLowerCase();
const nowIso = new Date().toISOString();
const settingKey = `scraper_runner_release_${releaseChannel}`;

const payload = [
  {
    key: settingKey,
    value: {
      channel: releaseChannel,
      build_id: process.env.RUNNER_BUILD_ID.trim(),
      build_sha: process.env.RUNNER_BUILD_SHA.trim(),
      image: process.env.RUNNER_IMAGE.trim(),
      digest: process.env.RUNNER_IMAGE_DIGEST.trim(),
      published_at: nowIso,
      ref_name: (process.env.GITHUB_REF_NAME || '').trim() || null,
      source_ref: (process.env.GITHUB_REF || '').trim() || null,
    },
    updated_at: nowIso,
  },
];

const endpoint = new URL(`${supabaseUrl}/rest/v1/site_settings`);
endpoint.searchParams.set('on_conflict', 'key');

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Failed to publish runner release metadata: ${response.status} ${body}`);
}

console.log(
  `Published ${releaseChannel} runner release metadata for build ${process.env.RUNNER_BUILD_ID.trim()} (${process.env.RUNNER_BUILD_SHA.trim()}).`
);
