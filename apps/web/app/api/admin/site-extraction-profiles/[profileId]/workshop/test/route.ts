/**
 * POST /api/admin/site-extraction-profiles/[profileId]/workshop/test
 * GET  /api/admin/site-extraction-profiles/[profileId]/workshop/test (health check)
 *
 * Synchronous extraction test — calls runner's workshop server directly.
 * Health check returns runner availability status so the UI can show
 * a clear message before the admin clicks Test.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

const RUNNER_URL = process.env.WORKSHOP_RUNNER_URL || 'http://localhost:9099';
const RUNNER_KEY = process.env.SCRAPER_API_KEY || process.env.BSR_API_KEY || '';

/** GET — health check: is the runner's workshop server reachable? */
export async function GET(request: NextRequest, _ctx: { params: Promise<{ profileId: string }> }) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    await fetch(`${RUNNER_URL}/`, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
    return NextResponse.json({ available: true, runner_url: RUNNER_URL });
  } catch {
    return NextResponse.json({
      available: false,
      runner_url: RUNNER_URL,
      hint: 'Start the scraper daemon: cd apps/scraper && python3 daemon.py --env dev --test-mode',
    });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;
  const { profileId } = await params;
  let body: { url?: string; selectors?: unknown[]; version_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { url, selectors, version_id } = body;
  if (!url || typeof url !== 'string') return NextResponse.json({ error: 'url required' }, { status: 400 });
  if (!Array.isArray(selectors) || !selectors.length) return NextResponse.json({ error: 'selectors[] required' }, { status: 400 });

  let browserRef: string | undefined;
  if (version_id) {
    const supabase = await createAdminClient();
    const { data: v } = await supabase.from('site_extraction_profile_versions').select('id').eq('id', version_id).eq('profile_id', profileId).maybeSingle();
    if (!v) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    const { data: p } = await supabase.from('site_extraction_profiles').select('brand_id,source_slug,canonical_domain').eq('id', profileId).maybeSingle();
    if (p) {
      const { data: bp } = await supabase.from('browser_profiles').select('storage_ref').eq('brand_id', p.brand_id).eq('source_slug', p.source_slug).eq('canonical_domain', p.canonical_domain).eq('status', 'validated').maybeSingle();
      if (bp?.storage_ref) browserRef = bp.storage_ref;
    }
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 18000);
    const res = await fetch(`${RUNNER_URL}/api/scraper/v1/workshop/extract`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': RUNNER_KEY },
      body: JSON.stringify({ url: url.trim(), selectors, browser_profile_ref: browserRef }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return NextResponse.json({ error: `Runner error: ${res.status}`, error_code: 'runner_error', results: [], images: [] }, { status: 502 });
    const data = await res.json();
    if (data.error) return NextResponse.json({ error: data.error, error_code: data.error_code || 'extraction_error', results: data.results || [], images: data.images || [], elapsed_ms: data.elapsed_ms }, { status: 422 });
    return NextResponse.json({ results: data.results || [], images: data.images || [], elapsed_ms: data.elapsed_ms, url: data.url || url, success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown';
    if (e instanceof DOMException && e.name === 'AbortError') {
      return NextResponse.json({
        error: 'Extraction timed out — the page took too long to respond. Try a simpler URL or check that the site is accessible.',
        error_code: 'timeout', results: [], images: [],
      }, { status: 504 });
    }
    return NextResponse.json({
      error: `Runner unavailable at ${RUNNER_URL}. Start the scraper daemon: cd apps/scraper && python3 daemon.py --env dev --test-mode`,
      error_code: 'runner_unavailable', runner_url: RUNNER_URL, results: [], images: [],
    }, { status: 502 });
  }
}
