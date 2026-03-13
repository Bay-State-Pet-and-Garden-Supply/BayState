import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = await params;
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
    const filePath = path.join(configsDir, `${slug}.yaml`);
    const alternateFilePath = path.join(configsDir, `${slug}.yml`);

    let finalPath = '';
    if (fs.existsSync(filePath)) {
      finalPath = filePath;
    } else if (fs.existsSync(alternateFilePath)) {
      finalPath = alternateFilePath;
    }

    if (!finalPath) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    const yamlContent = fs.readFileSync(finalPath, 'utf8');
    const config = yaml.parse(yamlContent);

    return NextResponse.json({
      yaml: yamlContent,
      config: {
        id: slug,
        name: config.name || slug,
        display_name: config.display_name || config.name || slug,
        base_url: config.base_url || '',
        ...config
      }
    });
  } catch (err) {
    console.error('Error in specific scraper config API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
