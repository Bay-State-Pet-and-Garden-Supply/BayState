import { NextResponse } from 'next/server';
import { getStatusCounts } from '@/lib/pipeline';

export async function GET() {
    const counts = await getStatusCounts();
    return NextResponse.json({ counts });
}
