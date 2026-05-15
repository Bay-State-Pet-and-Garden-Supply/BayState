import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * update-env.ts
 * 
 * Automatically updates .env.development for the scraper runner.
 * Pulls modern Supabase keys from CLI and shared keys from web/.env.local.
 */

async function main() {
  const scraperDir = process.cwd();
  const webDir = join(scraperDir, '..', 'web');
  const envPath = join(scraperDir, '.env.development');
  const examplePath = join(scraperDir, '.env.example');
  const webEnvPath = join(webDir, '.env.local');

  if (!existsSync(envPath)) {
    if (existsSync(examplePath)) {
      console.log('📝 .env.development not found, copying from .env.example...');
      writeFileSync(envPath, readFileSync(examplePath));
    } else {
      console.log('📝 .env.development and .env.example not found, creating minimal...');
      writeFileSync(envPath, 'SCRAPER_API_URL=http://localhost:3000\nSCRAPER_API_KEY=bsr_local_dev_key\nENVIRONMENT=dev\n');
    }
  }

  const updates = new Map<string, string>();

  // 0. Set local dev defaults
  updates.set('SCRAPER_API_URL', 'http://localhost:3000');
  updates.set('ENVIRONMENT', 'dev');

  // 1. Pull from Supabase status
  console.log('🔄 Fetching modern Supabase keys...');
  try {
    // We try to run this from the web directory where Supabase CLI is usually configured
    const statusOutput = execSync('npx supabase status -o env', { encoding: 'utf8', cwd: webDir });
    statusOutput.split('\n').forEach(line => {
      const match = line.match(/^([A-Z_]+)="(.+)"$/);
      if (match) {
        if (match[1] === 'PUBLISHABLE_KEY') updates.set('NEXT_PUBLIC_SUPABASE_ANON_KEY', match[2]);
        if (match[1] === 'API_URL') updates.set('NEXT_PUBLIC_SUPABASE_URL', match[2]);
      }
    });
  } catch (err) {
    console.warn('⚠️ Failed to run `supabase status`. Skipping Supabase key sync.');
  }

  // 2. Pull from web .env.local
  if (existsSync(webEnvPath)) {
    console.log('🔄 Pulling keys from web/.env.local...');
    const webEnvContent = readFileSync(webEnvPath, 'utf8');
    const webKeys = ['SCRAPER_API_KEY', 'AI_CREDENTIALS_ENCRYPTION_KEY'];
    webKeys.forEach(key => {
      const match = webEnvContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
      if (match) {
        updates.set(key, match[1].trim());
      }
    });
  }

  // 3. Update .env.development
  let envContent = readFileSync(envPath, 'utf8');
  let changed = false;

  updates.forEach((value, key) => {
    if (!value) return;

    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (envContent.match(regex)) {
      const currentLine = envContent.match(regex)![0];
      const newLine = `${key}=${value}`;
      if (currentLine.trim() !== newLine.trim()) {
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
    console.log('🎉 .env.development updated for scraper runner.');
  } else {
    console.log('✅ .env.development is already up to date.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
