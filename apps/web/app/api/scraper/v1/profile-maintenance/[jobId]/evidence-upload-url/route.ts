/**
 * POST /api/scraper/v1/profile-maintenance/[jobId]/evidence-upload-url
 *
 * Stub: evidence upload via signed URL is not implemented in Phase 1.
 * Inline evidence refs should be submitted directly via the result endpoint's
 * artifact.evidence_refs field.
 */
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function POST(_request: NextRequest, _context: RouteContext) {
  void _request;
  void _context;

  return NextResponse.json(
    {
      error: 'Not Implemented',
      message:
        'Evidence upload via signed URL is not available in Phase 1. ' +
        'Submit evidence refs inline via artifact.evidence_refs in the result endpoint.',
    },
    { status: 501 },
  );
}
