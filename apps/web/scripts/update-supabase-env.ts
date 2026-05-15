import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * update-supabase-env.ts
 * 
 * Automatically updates .env.local with modern 'sb_' prefixed keys 
 * from `supabase status -o env`.
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

  console.log('🔄 Fetching modern Supabase keys...');
  let statusOutput = '';
  try {
    statusOutput = execSync('npx supabase status -o env', { encoding: 'utf8' });
  } catch (err) {
    console.error('❌ Failed to run `supabase status`. Is Supabase running?');
    console.error('   Run `bun run db:start` first.');
    process.exit(1);
  }

  const keys = new Map<string, string>();
  statusOutput.split('\n').forEach(line => {
    const match = line.match(/^([A-Z_]+)="(.+)"$/);
    if (match) {
      keys.set(match[1], match[2]);
    }
  });

  const publishableKey = keys.get('PUBLISHABLE_KEY');
  const secretKey = keys.get('SECRET_KEY');
  const apiUrl = keys.get('API_URL');
  const dbUrl = keys.get('DB_URL');

  if (!publishableKey || !secretKey) {
    console.warn('⚠️ Could not find modern PUBLISHABLE_KEY or SECRET_KEY in supabase status.');
    console.log('   Check if your Supabase CLI version is up to date (>= 1.106.0 recommended).');
    process.exit(0);
  }

  let envContent = readFileSync(envPath, 'utf8');

  const updates = [
    { key: 'NEXT_PUBLIC_SUPABASE_URL', value: apiUrl },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: publishableKey },
    { key: 'SUPABASE_SECRET_KEY', value: secretKey },
    { key: 'SUPABASE_DB_URL', value: dbUrl },
    { key: 'DATABASE_URL', value: dbUrl },
  ];

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
      // If key doesn't exist, append it
      envContent += `\n${key}=${value}`;
      changed = true;
      console.log(`➕ Added ${key}`);
    }
  });

  if (changed) {
    writeFileSync(envPath, envContent);
    console.log('🎉 .env.local updated with modern Supabase keys.');
  } else {
    console.log('✅ .env.local is already up to date with modern keys.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
