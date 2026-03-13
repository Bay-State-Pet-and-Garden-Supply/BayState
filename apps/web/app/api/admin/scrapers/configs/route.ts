import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const configsDir = path.join(process.cwd(), '../scraper/scrapers/configs');
    
    if (!fs.existsSync(configsDir)) {
      console.error(`Configs directory not found: ${configsDir}`);
      return NextResponse.json({ configs: [] });
    }

    const files = fs.readdirSync(configsDir);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    const configs = yamlFiles.map(filename => {
      try {
        const filePath = path.join(configsDir, filename);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const config = yaml.parse(fileContent);

        return {
          id: filename.replace(/\.ya?ml$/, ''),
          name: config.name || filename.replace(/\.ya?ml$/, ''),
          display_name: config.display_name || config.name || filename.replace(/\.ya?ml$/, ''),
          base_url: config.base_url || '',
          scraper_type: config.scraper_type || 'static',
          status: config.status || 'active',
          filename
        };
      } catch (err) {
        console.error(`Error parsing yaml file ${filename}:`, err);
        return null;
      }
    }).filter(c => c !== null);

    return NextResponse.json({ configs });
  } catch (err) {
    console.error('Error in scraper configs API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
