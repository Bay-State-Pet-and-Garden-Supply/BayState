import { createClient } from '@supabase/supabase-js';
import { assembleScraperConfigBySlug } from '@/lib/admin/scraper-configs/assemble-config';
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';

async function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, key);
}

async function ensureDir(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
}

async function main() {
  const supabase = await getSupabaseAdmin();

  // 1) Find all published scraper config slugs
  // Use explicit foreign key embedding to avoid PostgREST ambiguity
  // There are two relations between scraper_config_versions and scraper_configs
  // -> use the fk_config_id relation which links versions.config_id -> configs.id
  const { data: versions, error } = await supabase
    .from('scraper_config_versions')
    .select('config_id, scraper_configs!fk_config_id (slug)')
    .eq('status', 'published');

  if (error) {
    console.error('Failed to query published versions:', error);
    process.exitCode = 2;
    return;
  }

  const slugSet = new Set<string>();
  (versions || []).forEach((v: any) => {
    const slug = v.scraper_configs?.slug || null;
    if (slug) slugSet.add(slug);
  });

  const slugs = Array.from(slugSet).sort();
  if (!slugs.length) {
    console.log('No published scraper configs found.');
  }

  const repoConfigsDir = path.resolve(__dirname, '..', '..', 'scraper', 'scrapers', 'configs');
  await ensureDir(repoConfigsDir);

  const evidenceDir = path.resolve(__dirname, '..', '..', '..', '.sisyphus', 'evidence');
  await ensureDir(evidenceDir);

  let exported = 0;
  let skipped = 0;
  let updated = 0;

  for (const slug of slugs) {
    try {
      const payload = await assembleScraperConfigBySlug(slug, supabase as any);
      if (!payload) {
        console.warn(`Skipping ${slug}: failed to assemble payload`);
        skipped += 1;
        continue;
      }

      const yamlText = YAML.stringify(payload);
      const targetPath = path.join(repoConfigsDir, `${slug}.yaml`);

      let write = true;
      try {
        const existing = await fs.readFile(targetPath, { encoding: 'utf-8' });
        if (existing === yamlText) {
          console.log(`Unchanged: ${targetPath}`);
          skipped += 1;
          write = false;
        }
      } catch (e) {
        // file doesn't exist -> will write
      }

      if (write) {
        await fs.writeFile(targetPath, yamlText, { encoding: 'utf-8' });
        console.log(`${existingOrNew(write)}: ${targetPath}`);
        exported += 1;
        updated += 1;
      }
    } catch (e: any) {
      console.error(`Error exporting ${slug}:`, e?.message || e);
      skipped += 1;
    }
  }

  const countsFile = path.join(evidenceDir, 'task-2-1-export-counts.txt');
  const summary = `exported=${exported}\nskipped=${skipped}\nupdated=${updated}\ntotal_found=${slugs.length}\n`;
  await fs.writeFile(countsFile, summary, { encoding: 'utf-8' });
  console.log('Summary written to', countsFile);
}

function existingOrNew(wrote: boolean) {
  return wrote ? 'WROTE' : 'SKIPPED';
}

// Execute when run directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
