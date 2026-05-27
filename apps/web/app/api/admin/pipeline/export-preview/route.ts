import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { loadStorefrontShopSiteExport } from '@/lib/shopsite/export-builder';

export const runtime = 'nodejs';

interface PreviewRequestBody {
  upcs?: unknown;
}

function parseUpcSelection(body: PreviewRequestBody): string[] {
  if (body.upcs === undefined) {
    return [];
  }

  if (!Array.isArray(body.upcs)) {
    throw new Error('Expected "upcs" to be an array of UPC strings');
  }

  return body.upcs
    .map((upc) => (typeof upc === 'string' ? upc.trim() : ''))
    .filter((upc) => upc.length > 0);
}

async function buildPreviewResponse(upcs?: string[]) {
  const { products } = await loadStorefrontShopSiteExport({ 
    upcs,
    includeExportedRequestedUpcs: true // Let them preview even if already exported if they ask specifically
  });

  return NextResponse.json({ products });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(request.url);
    const upcsParam = url.searchParams.get('upcs');
    const upcs = upcsParam ? upcsParam.split(',').filter(Boolean) : undefined;
    return await buildPreviewResponse(upcs);
  } catch (err) {
    console.error('[ExportPreview] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate preview mapping' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as PreviewRequestBody;
    const upcs = parseUpcSelection(body);
    return await buildPreviewResponse(upcs.length > 0 ? upcs : undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate preview mapping';
    const status = message.includes('Expected "upcs"') ? 400 : 500;
    console.error('[ExportPreview] Error:', err);
    return NextResponse.json({ error: message }, { status });
  }
}
