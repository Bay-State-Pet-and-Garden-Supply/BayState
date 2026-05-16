import { execSync } from 'child_process';
import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * update-local-env.ts
 * 
 * Automatically updates .env.local with modern 'sb_' prefixed keys 
 * from `supabase status -o env` and Stripe webhook secrets.
 */

async function main() {
  const envPath = join(process.cwd(), '.env.local');
  const examplePath = join(process.cwd(), '.env.local.example');

  if (!existsSync(envPath)) {
    if (existsSync(examplePath)) {
      console.log('📝 .env.local not found, copying from .env.local.example...');
      writeFileSync(envPath, readFileSync(examplePath));
    } else {
      console.error('❌ Neither .env.local nor .env.local.example found.');
      process.exit(1);
    }
  }

  const updates: { key: string, value: string }[] = [];

  // 1. Fetch Supabase Keys
  console.log('🔄 Fetching modern Supabase keys (waiting for DB if needed)...');
  let statusOutput = '';
  let retries = 20;
  while (retries > 0) {
    try {
      statusOutput = execSync('bunx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (statusOutput.includes('API_URL')) break;
    } catch (err: any) {
      const errorMsg = err.stderr?.toString() || err.message || '';
      if (errorMsg.includes('No such container')) {
        console.error('❌ Supabase containers are missing. Did you run `bun run web:db:start`?');
        process.exit(1);
      }
    }
    console.log(`⏳ Waiting for Supabase to be healthy... (${retries} retries left)`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    retries--;
  }

  if (!statusOutput.includes('API_URL')) {
    console.error('❌ Timeout waiting for Supabase status. Please check Docker health.');
    process.exit(1);
  }

  try {
    const keys = new Map<string, string>();
    statusOutput.split('\n').forEach(line => {
      const match = line.match(/^([A-Z_]+)="(.+)"$/);
      if (match) {
        keys.set(match[1].trim(), match[2].trim());
      }
    });

    const publishableKey = keys.get('PUBLISHABLE_KEY');
    const secretKey = keys.get('SECRET_KEY');
    const apiUrl = keys.get('API_URL');
    const dbUrl = keys.get('DB_URL');

    if (!publishableKey || !secretKey || !apiUrl) {
      console.error('❌ Could not find required Supabase keys (PUBLISHABLE_KEY, SECRET_KEY, API_URL).');
      console.error('   This might happen if you are using an old version of the Supabase CLI.');
      console.error('   Try running `bunx supabase --version` (should be >= 1.150.0).');
      process.exit(1);
    }

    updates.push(
      { key: 'NEXT_PUBLIC_SUPABASE_URL', value: apiUrl },
      { key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', value: publishableKey },
      { key: 'SUPABASE_SECRET_KEY', value: secretKey },
      { key: 'SUPABASE_DB_URL', value: dbUrl || '' },
      { key: 'DATABASE_URL', value: dbUrl || '' },
    );
  } catch (err: any) {
    console.error('❌ Failed to process `supabase status`.', err.message);
    process.exit(1);
  }

  // 2. Fetch Stripe Webhook Secret
  console.log('ℹ️ Stripe webhook secret is managed by `bun run stripe:listen`.');
  
  // 3. Handle Scraper Encryption Key
  console.log('🔄 Checking Scraper Encryption Key...');
  let envContent = readFileSync(envPath, 'utf8');
  const encryptionKeyKey = 'AI_CREDENTIALS_ENCRYPTION_KEY';
  const encryptionKeyRegex = new RegExp(`^${encryptionKeyKey}=.*$`, 'm');
  const keyMatch = envContent.match(encryptionKeyRegex);

  if (!keyMatch || keyMatch[0].includes('your-key-here') || keyMatch[0].split('=')[1].trim() === '') {
    const newKey = crypto.randomBytes(32).toString('base64');
    updates.push({ key: encryptionKeyKey, value: newKey });
  }

  // 4. Handle Scraper API Key for Local Dev
  console.log('🔄 Checking Scraper API Key...');
  const scraperKeyKey = 'SCRAPER_API_KEY';
  const scraperKeyRegex = new RegExp(`^${scraperKeyKey}=.*$`, 'm');
  if (!envContent.match(scraperKeyRegex)) {
    updates.push({ key: scraperKeyKey, value: 'bsr_local_dev_key' });
  }

  let changed = false;

  updates.forEach(({ key, value }) => {
    if (!value) return;

    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (envContent.match(regex)) {
      const currentLine = envContent.match(regex)![0];
      const newLine = `${key}=${value}`;
      if (currentLine !== newLine) {
        envContent = envContent.replace(regex, newLine);
        changed = true;
        console.log(`✅ Updated ${key}`);
      }
    } else {
      envContent += `\n${key}=${value}`;
      changed = true;
      console.log(`➕ Added ${key}`);
    }
  });

  if (changed) {
    writeFileSync(envPath, envContent);
    console.log('🎉 .env.local updated.');
  } else {
    console.log('✅ .env.local is already up to date.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
