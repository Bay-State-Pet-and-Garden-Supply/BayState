#!/usr/bin/env bun
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Load env variables manually from .env.local to ensure they are available
const envPath = join(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';
const ENCRYPTION_KEY = process.env.AI_CREDENTIALS_ENCRYPTION_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('❌ Supabase keys (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY) are not set.');
  process.exit(1);
}

if (!ENCRYPTION_KEY) {
  console.error('❌ AI_CREDENTIALS_ENCRYPTION_KEY is not configured in .env.local.');
  process.exit(1);
}

// Setup encryption key buffer (handling both base64 and utf8)
let keyBuffer: Buffer;
try {
  const trimmed = ENCRYPTION_KEY.trim();
  const maybeBase64 = Buffer.from(trimmed, 'base64');
  if (maybeBase64.length === 32 && maybeBase64.toString('base64').replace(/=+$/, '') === trimmed.replace(/=+$/, '')) {
    keyBuffer = maybeBase64;
  } else {
    keyBuffer = Buffer.from(trimmed, 'utf8');
  }

  if (keyBuffer.length !== 32) {
    throw new Error(`Key must be exactly 32 bytes (got ${keyBuffer.length})`);
  }
} catch (err: any) {
  console.error(`❌ Invalid AI_CREDENTIALS_ENCRYPTION_KEY: ${err.message}`);
  process.exit(1);
}

// AES-256-GCM encryption logic matching application credentials lib
function encrypt(secret: string): { encryptedValue: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

async function main() {
  console.log('🔑 Seeding local credentials...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const nowIso = new Date().toISOString();

  // --- 1. AI API Keys ---
  const aiKeys = [
    { envName: 'DEEPSEEK_API_KEY', provider: 'deepseek' },
    { envName: 'OPENAI_API_KEY', provider: 'openai' },
    { envName: 'GEMINI_API_KEY', provider: 'gemini' },
    { envName: 'BRAVE_API_KEY', provider: 'brave' },
    { envName: 'SERPAPI_API_KEY', provider: 'serpapi' },
  ];

  for (const { envName, provider } of aiKeys) {
    const value = process.env[envName];
    if (value && value.trim()) {
      const trimmed = value.trim();
      const encrypted = encrypt(trimmed);
      const last4 = trimmed.slice(-4);

      console.log(`  🤖 Seeding AI provider key for '${provider}' (from ${envName})...`);
      const { error } = await supabase
        .from('ai_provider_credentials')
        .upsert(
          {
            provider,
            encrypted_value: encrypted.encryptedValue,
            iv: encrypted.iv,
            auth_tag: encrypted.authTag,
            last4,
            key_version: 1,
            updated_at: nowIso,
          },
          { onConflict: 'provider' }
        );

      if (error) {
        console.error(`  ❌ Failed to seed AI provider key for '${provider}':`, error.message);
      } else {
        console.log(`  ✅ Successfully seeded '${provider}'`);
      }
    }
  }

  // --- 2. Distributor/Scraper Logins ---
  const distributors = [
    { slug: 'petfoodex', envPrefix: 'PETFOODEX' },
    { slug: 'phillips', envPrefix: 'PHILLIPS' },
    { slug: 'orgill', envPrefix: 'ORGILL' },
  ];

  for (const { slug, envPrefix } of distributors) {
    const username = process.env[`${envPrefix}_USERNAME`];
    const password = process.env[`${envPrefix}_PASSWORD`];

    if (username && username.trim()) {
      const encrypted = encrypt(username.trim());
      console.log(`  📦 Seeding login for distributor '${slug}'...`);
      const { error } = await supabase
        .from('scraper_credentials')
        .upsert(
          {
            scraper_slug: slug,
            credential_type: 'login',
            encrypted_value: encrypted.encryptedValue,
            iv: encrypted.iv,
            auth_tag: encrypted.authTag,
            key_version: 1,
            updated_at: nowIso,
          },
          { onConflict: 'scraper_slug,credential_type' }
        );
      if (error) {
        console.error(`  ❌ Failed to seed username for '${slug}':`, error.message);
      }
    }

    if (password && password.trim()) {
      const encrypted = encrypt(password.trim());
      console.log(`  🔑 Seeding password for distributor '${slug}'...`);
      const { error } = await supabase
        .from('scraper_credentials')
        .upsert(
          {
            scraper_slug: slug,
            credential_type: 'password',
            encrypted_value: encrypted.encryptedValue,
            iv: encrypted.iv,
            auth_tag: encrypted.authTag,
            key_version: 1,
            updated_at: nowIso,
          },
          { onConflict: 'scraper_slug,credential_type' }
        );
      if (error) {
        console.error(`  ❌ Failed to seed password for '${slug}':`, error.message);
      }
    }
  }

  // --- 3. ShopSite Credentials ---
  const shopsiteUrl = process.env.SHOPSITE_STORE_URL;
  const shopsiteMerchantId = process.env.SHOPSITE_MERCHANT_ID;
  const shopsitePassword = process.env.SHOPSITE_PASSWORD;

  if (shopsiteUrl && shopsiteUrl.trim() && shopsiteMerchantId && shopsiteMerchantId.trim() && shopsitePassword && shopsitePassword.trim()) {
    console.log(`  🛒 Seeding ShopSite configuration (from SHOPSITE_STORE_URL/MERCHANT_ID/PASSWORD)...`);
    const { error } = await supabase
      .from('site_settings')
      .upsert(
        {
          key: 'shopsite_migration',
          value: {
            storeUrl: shopsiteUrl.trim(),
            merchantId: shopsiteMerchantId.trim(),
            password: shopsitePassword.trim(),
          },
          updated_at: nowIso,
        },
        { onConflict: 'key' }
      );

    if (error) {
      console.error(`  ❌ Failed to seed ShopSite settings:`, error.message);
    } else {
      console.log(`  ✅ Successfully seeded ShopSite settings`);
    }
  }

  // --- 4. AI Provider Configs ---
  const aiConfigs = [
    { provider_type: 'deepseek', name: 'DeepSeek Cloud', base_url: 'https://api.deepseek.com/v1', default_model: 'deepseek-chat', envName: 'DEEPSEEK_API_KEY' },
    { provider_type: 'openai', name: 'OpenAI Direct', base_url: 'https://api.openai.com/v1', default_model: 'gpt-4o-mini', envName: 'OPENAI_API_KEY' },
    { provider_type: 'gemini', name: 'Gemini Direct', base_url: 'https://generativelanguage.googleapis.com/v1beta', default_model: 'gemini-3.5-flash', envName: 'GEMINI_API_KEY' },
  ];

  let hasSetExtractionActive = false;
  let hasSetConsolidationActive = false;

  for (const config of aiConfigs) {
    const value = process.env[config.envName];
    if (value && value.trim()) {
      const trimmed = value.trim();
      const encrypted = encrypt(trimmed);
      
      const isActive = !hasSetExtractionActive;
      const isActiveCons = !hasSetConsolidationActive;
      
      if (isActive) hasSetExtractionActive = true;
      if (isActiveCons) hasSetConsolidationActive = true;

      console.log(`  🤖 Seeding AI provider config for '${config.name}' (from ${config.envName})...`);
      
      const { data: existing } = await supabase
        .from('ai_provider_configs')
        .select('id, is_active, is_active_for_consolidation')
        .eq('provider_type', config.provider_type)
        .maybeSingle();

      const payload = {
        name: config.name,
        provider_type: config.provider_type,
        base_url: config.base_url,
        default_model: config.default_model,
        encrypted_key: encrypted.encryptedValue,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_version: 1,
        is_active: existing ? (existing.is_active ?? isActive) : isActive,
        is_active_for_consolidation: existing ? (existing.is_active_for_consolidation ?? isActiveCons) : isActiveCons,
        updated_at: nowIso,
      };

      let error;
      if (existing) {
        const { error: updateError } = await supabase
          .from('ai_provider_configs')
          .update(payload)
          .eq('id', existing.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('ai_provider_configs')
          .insert(payload);
        error = insertError;
      }

      if (error) {
        console.error(`  ❌ Failed to seed AI provider config for '${config.name}':`, error.message);
      } else {
        console.log(`  ✅ Successfully seeded AI provider config for '${config.name}' (active: ${payload.is_active}, consolidation: ${payload.is_active_for_consolidation})`);
      }
    }
  }

  console.log('🎉 Credentials seeding finished.');
}

main().catch(err => {
  console.error('Fatal error during credentials seeding:', err);
  process.exit(1);
});
