import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('scrape_jobs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error(`Error cancelling scraper run ${id}:`, error);
      return NextResponse.json(
        { error: 'Failed to cancel scraper run' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in cancel endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
