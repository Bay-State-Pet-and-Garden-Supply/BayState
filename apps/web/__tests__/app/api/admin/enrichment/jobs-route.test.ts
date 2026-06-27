/**
 * Tests for POST /api/admin/enrichment/jobs
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/admin/api-auth');
jest.mock('@/lib/pipeline-scraping');
jest.mock('@/lib/supabase/server');

const { NextRequest, NextResponse } = require('next/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { scrapeProducts } = require('@/lib/pipeline-scraping');
const { createAdminClient } = require('@/lib/supabase/server');
const { POST } = require('@/app/api/admin/enrichment/jobs/route');

describe('POST /api/admin/enrichment/jobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAdminAuth.mockResolvedValue({ authorized: true, user: { id: 'admin-1' }, role: 'admin' });
    createAdminClient.mockResolvedValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          in: jest.fn().mockResolvedValue({
            data: [{ upc: '072705115310', brand_id: 'brand-1' }],
            error: null,
          }),
        })),
      })),
    });
  });

  it('returns 401 when not authenticated', async () => {
    requireAdminAuth.mockResolvedValue({ authorized: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    const res = await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({ upcs: ['072705115310'] }) }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when upcs missing', async () => {
    const res = await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('upcs array is required');
  });

  it('returns 400 when upcs empty', async () => {
    const res = await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({ upcs: [] }) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when upcs exceed 500', async () => {
    const upcs = Array.from({ length: 501 }, (_, i) => String(i));
    const res = await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({ upcs }) }));
    expect(res.status).toBe(400);
  });

  it('returns jobIds on success', async () => {
    scrapeProducts.mockResolvedValue({ success: true, jobIds: ['job-1'] });
    const res = await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({ upcs: ['072705115310'] }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.jobIds).toEqual(['job-1']);
  });

  it('passes retryMode and testMode', async () => {
    scrapeProducts.mockResolvedValue({ success: true, jobIds: ['job-1'] });
    await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({ upcs: ['072705115310'], retryMode: 'failed_or_untried', testMode: true }) }));
    expect(scrapeProducts).toHaveBeenCalledWith(['072705115310'], expect.objectContaining({ retryMode: 'failed_or_untried', testMode: true }));
  });

  it('passes upcResolutionV2Enabled when explicitly set in request', async () => {
    scrapeProducts.mockResolvedValue({ success: true, jobIds: ['job-1'] });
    await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({ upcs: ['072705115310'], upcResolutionV2Enabled: true }) }));
    expect(scrapeProducts).toHaveBeenCalledWith(['072705115310'], expect.objectContaining({ upcResolutionV2Enabled: true }));
  });

  it('defaults upcResolutionV2Enabled to false when not provided', async () => {
    scrapeProducts.mockResolvedValue({ success: true, jobIds: ['job-1'] });
    await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({ upcs: ['072705115310'] }) }));
    expect(scrapeProducts).toHaveBeenCalledWith(['072705115310'], expect.objectContaining({ upcResolutionV2Enabled: false }));
  });

  it('returns 400 when any selected UPC is missing brand_id', async () => {
    createAdminClient.mockResolvedValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          in: jest.fn().mockResolvedValue({
            data: [{ upc: '072705115310', brand_id: null }],
            error: null,
          }),
        })),
      })),
    });

    const res = await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({ upcs: ['072705115310'] }) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('must have a brand');
    expect(body.missingBrandUpcs).toEqual(['072705115310']);
    expect(scrapeProducts).not.toHaveBeenCalled();
  });

  it('returns 400 on scrape failure', async () => {
    scrapeProducts.mockResolvedValue({ success: false, error: 'No plans', skippedUpcs: [{ upc: 'x', reason: 'missing_brand' }] });
    const res = await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({ upcs: ['072705115310'] }) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('No plans');
    expect(body.skippedUpcs).toHaveLength(1);
  });

  it('returns 500 on unexpected error', async () => {
    scrapeProducts.mockRejectedValue(new Error('DB error'));
    const res = await POST(new NextRequest('http://localhost/api/admin/enrichment/jobs', { method: 'POST', body: JSON.stringify({ upcs: ['072705115310'] }) }));
    expect(res.status).toBe(500);
  });
});

export {};
