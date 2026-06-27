/**
 * GET /api/admin/profile-maintenance/artifacts/[id]
 *
 * Read a single artifact with full payload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();
  const { id: artifactId } = await params;

  const { data: artifact, error: artifactError } = await supabase
    .from('profile_maintenance_artifacts')
    .select('*')
    .eq('id', artifactId)
    .single();

  if (artifactError || !artifact) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
  }

  // Artifacts are immutable (payload never changes), but review_status may change.
  // Use no-cache to ensure review-related changes are visible immediately.
  return NextResponse.json(artifact, {
    headers: {
      'Cache-Control': 'no-cache',
    },
  });
}
