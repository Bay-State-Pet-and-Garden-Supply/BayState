import { createClient } from '@/lib/supabase/server';
import { scraperConfigSchema } from '@/lib/admin/scrapers/schema';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('scrapers')
      .select('id, name, display_name, description, status, health_status, health_score, base_url')
      .order('name');

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const json = await request.json();

    // Validate config structure
    const config = scraperConfigSchema.parse(json);

    // Insert into database
    const { data, error } = await supabase
      .from('scrapers')
      .insert({
        name: config.name,
        display_name: config.display_name,
        base_url: config.base_url,
        config: config,
        status: 'draft',
        health_status: 'unknown',
        health_score: 100
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Request error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
