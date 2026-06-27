/**
 * Unit tests for lib/profile-maintenance/explicit-correction-helpers.ts
 *
 * Tests for:
 * - aggregateCorrectionsIntoRules
 * - computeVersionHash
 * - createDraftVersionFromCorrections
 * - buildStubCrawl4aiSchema
 */

import {
  aggregateCorrectionsIntoRules,
  computeVersionHash,
  buildStubCrawl4aiSchema,
  createDraftVersionFromCorrections,
} from '@/lib/profile-maintenance/explicit-correction-helpers';
import type { CorrectionRow } from '@/lib/profile-maintenance/explicit-correction-helpers';

// =============================================================================
// Test fixtures
// =============================================================================

const BRAND_ID = 'brand-123';
const SOURCE_SLUG = 'test-brand';
const CANONICAL_DOMAIN = 'example.com';

function makeCorrection(overrides: Partial<CorrectionRow> = {}): CorrectionRow {
  return {
    id: `corr-${Math.random().toString(36).substring(2, 8)}`,
    brand_id: BRAND_ID,
    source_slug: SOURCE_SLUG,
    canonical_domain: CANONICAL_DOMAIN,
    target_field: 'product_image',
    correction_type: 'accepted',
    evidence_summary: { url: 'https://example.com/img.jpg', alt: 'Test image' },
    ...overrides,
  };
}

// =============================================================================
// aggregateCorrectionsIntoRules
// =============================================================================

describe('aggregateCorrectionsIntoRules', () => {
  it('groups corrections by target_field', () => {
    const c1 = makeCorrection({ target_field: 'product_image', correction_type: 'accepted' });
    const c2 = makeCorrection({ target_field: 'product_name', correction_type: 'accepted' });
    const c3 = makeCorrection({ target_field: 'product_image', correction_type: 'rejected' });

    const result = aggregateCorrectionsIntoRules([c1, c2, c3]);

    expect(result.corrections).toHaveProperty('product_image');
    expect(result.corrections).toHaveProperty('product_name');
    expect(result.corrections.product_image.accepted).toHaveLength(1);
    expect(result.corrections.product_image.rejected).toHaveLength(1);
    expect(result.corrections.product_name.accepted).toHaveLength(1);
    expect(result.corrections.product_name.rejected).toHaveLength(0);
  });

  it('separates accepted and rejected evidence per field', () => {
    const c1 = makeCorrection({ target_field: 'product_image', correction_type: 'accepted', evidence_summary: { url: 'good.jpg' } });
    const c2 = makeCorrection({ target_field: 'product_image', correction_type: 'rejected', evidence_summary: { url: 'bad.jpg' } });
    const c3 = makeCorrection({ target_field: 'product_image', correction_type: 'accepted', evidence_summary: { url: 'also-good.jpg' } });

    const result = aggregateCorrectionsIntoRules([c1, c2, c3]);

    expect(result.corrections.product_image.accepted).toHaveLength(2);
    expect(result.corrections.product_image.rejected).toHaveLength(1);
    expect(result.corrections.product_image.accepted[0].evidence_summary.url).toBe('good.jpg');
    expect(result.corrections.product_image.rejected[0].evidence_summary.url).toBe('bad.jpg');
  });

  it('includes _meta fields', () => {
    const c1 = makeCorrection({ target_field: 'product_image' });
    const c2 = makeCorrection({ target_field: 'product_name' });

    const result = aggregateCorrectionsIntoRules([c1, c2]);

    expect(result._meta.correction_count).toBe(2);
    expect(result._meta.source_fields).toEqual(['product_image', 'product_name']);
    expect(result._meta.aggregated_at).toBeDefined();
  });

  it('handles empty input', () => {
    const result = aggregateCorrectionsIntoRules([]);
    expect(result.corrections).toEqual({});
    expect(result._meta.correction_count).toBe(0);
    expect(result._meta.source_fields).toEqual([]);
  });

  it('groups by target_field in sorted order', () => {
    const c1 = makeCorrection({ target_field: 'zz_field' });
    const c2 = makeCorrection({ target_field: 'aa_field' });

    const result = aggregateCorrectionsIntoRules([c1, c2]);
    expect(result._meta.source_fields).toEqual(['aa_field', 'zz_field']);
  });
});

// =============================================================================
// computeVersionHash
// =============================================================================

describe('computeVersionHash', () => {
  it('produces a deterministic hash for the same input', () => {
    const rules = { corrections: { product_image: { accepted: [] } } };
    const hash1 = computeVersionHash(rules);
    const hash2 = computeVersionHash(rules);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different input', () => {
    const rules1 = { corrections: { product_image: { accepted: [] } } };
    const rules2 = { corrections: { product_name: { accepted: [] } } };
    const hash1 = computeVersionHash(rules1);
    const hash2 = computeVersionHash(rules2);
    expect(hash1).not.toBe(hash2);
  });

  it('returns a 32-character hex string', () => {
    const rules = { corrections: {} };
    const hash = computeVersionHash(rules);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is stable regardless of key insertion order', () => {
    // In JS, object key order is insertion order, but our hasher sorts keys
    const rules1 = { b: 1, a: 2 };
    const rules2 = { a: 2, b: 1 };
    expect(computeVersionHash(rules1)).toBe(computeVersionHash(rules2));
  });
});

// =============================================================================
// buildStubCrawl4aiSchema
// =============================================================================

describe('buildStubCrawl4aiSchema', () => {
  it('builds schema from aggregated rules', () => {
    const c1 = makeCorrection({ target_field: 'product_image' });
    const c2 = makeCorrection({ target_field: 'product_name' });
    const aggregated = aggregateCorrectionsIntoRules([c1, c2]);

    const schema = buildStubCrawl4aiSchema(aggregated);

    expect(schema.name).toBe('explicit-correction-draft');
    expect(schema.metadata.source).toBe('explicit_correction');
    expect(schema.metadata.correction_count).toBe(2);
    expect(schema.fields).toHaveLength(2);
    expect(schema.fields[0].name).toBe('product_image');
    expect(schema.fields[1].name).toBe('product_name');
  });

  it('handles empty rules', () => {
    const aggregated = aggregateCorrectionsIntoRules([]);
    const schema = buildStubCrawl4aiSchema(aggregated);
    expect(schema.fields).toHaveLength(0);
    expect(schema.metadata.correction_count).toBe(0);
  });
});

// =============================================================================
// createDraftVersionFromCorrections
// =============================================================================

describe('createDraftVersionFromCorrections', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeMockSupabase(options?: {
    latestVersionNumber?: number | null;
    insertResult?: Record<string, unknown> | null;
    insertError?: any;
  }) {
    const {
      latestVersionNumber = null,
      insertResult = { id: 'new-version-1', version_number: 1 },
      insertError = null,
    } = options ?? {};

    const latestVersionMaybeSingle = jest.fn().mockResolvedValue({
      data: latestVersionNumber ? { version_number: latestVersionNumber } : null,
      error: null,
    });
    const latestVersionLimit = jest.fn().mockReturnValue({ maybeSingle: latestVersionMaybeSingle });
    const latestVersionOrder = jest.fn().mockReturnValue({ limit: latestVersionLimit });
    const latestVersionEq = jest.fn().mockReturnValue({ order: latestVersionOrder });
    const latestVersionSelect = jest.fn().mockReturnValue({ eq: latestVersionEq });

    // Track the insert data passed to .insert()
    let capturedInsertData: Record<string, unknown> | null = null;

    const versionInsertSingle = jest.fn().mockResolvedValue({
      data: insertResult,
      error: insertError,
    });

    const versionInsertSelect = jest.fn().mockReturnValue({
      single: versionInsertSingle,
    });

    const versionInsertFn = jest.fn().mockImplementation((data: Record<string, unknown>) => {
      capturedInsertData = data;
      return { select: versionInsertSelect };
    });

    return {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return {
            select: latestVersionSelect,
            insert: versionInsertFn,
          };
        }
        return { select: jest.fn(), update: jest.fn(), insert: jest.fn() };
      }),
      // Provide an accessor for the insert data
      getInsertData: () => capturedInsertData,
    };
  }

  it('creates a draft version with version_number=1 when no prior versions', async () => {
    mockSupabase = makeMockSupabase({ latestVersionNumber: null });
    const corrections = [makeCorrection()];

    const result = await createDraftVersionFromCorrections(mockSupabase, corrections, {
      profileId: 'profile-1',
      createdBy: 'user-1',
      brandId: BRAND_ID,
      sourceSlug: SOURCE_SLUG,
      canonicalDomain: CANONICAL_DOMAIN,
    });

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('id', 'new-version-1');

    const insertCall = mockSupabase.getInsertData();
    expect(insertCall.version_number).toBe(1);
    expect(insertCall.created_from).toBe('explicit_correction');
    expect(insertCall.created_by).toBe('user-1');
    expect(insertCall.status).toBe('draft');
    expect(insertCall.version_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(insertCall.rules).toBeDefined();
    expect(insertCall.rules._meta.correction_count).toBe(1);
    expect(insertCall.rules._meta.source_fields).toEqual(['product_image']);
  });

  it('increments version_number when prior versions exist', async () => {
    mockSupabase = makeMockSupabase({ latestVersionNumber: 3 });
    const corrections = [makeCorrection()];

    const result = await createDraftVersionFromCorrections(mockSupabase, corrections, {
      profileId: 'profile-1',
      createdBy: 'user-1',
      brandId: BRAND_ID,
      sourceSlug: SOURCE_SLUG,
      canonicalDomain: CANONICAL_DOMAIN,
    });

    expect(result).not.toBeNull();

    const insertCall = mockSupabase.getInsertData();
    expect(insertCall.version_number).toBe(4);
  });

  it('returns null when no corrections provided', async () => {
    mockSupabase = makeMockSupabase();
    const result = await createDraftVersionFromCorrections(mockSupabase, [], {
      profileId: 'profile-1',
      createdBy: 'user-1',
      brandId: BRAND_ID,
      sourceSlug: SOURCE_SLUG,
      canonicalDomain: CANONICAL_DOMAIN,
    });
    expect(result).toBeNull();
  });

  it('returns null on database error', async () => {
    mockSupabase = makeMockSupabase({
      latestVersionNumber: null,
      insertError: { message: 'Database error' },
      insertResult: null,
    });
    const corrections = [makeCorrection()];

    const result = await createDraftVersionFromCorrections(mockSupabase, corrections, {
      profileId: 'profile-1',
      createdBy: 'user-1',
      brandId: BRAND_ID,
      sourceSlug: SOURCE_SLUG,
      canonicalDomain: CANONICAL_DOMAIN,
    });

    expect(result).toBeNull();
  });

  it('aggregates all corrections into the version rules', async () => {
    mockSupabase = makeMockSupabase({ latestVersionNumber: null });
    const corrections = [
      makeCorrection({ target_field: 'product_image', correction_type: 'accepted' }),
      makeCorrection({ target_field: 'product_image', correction_type: 'rejected' }),
      makeCorrection({ target_field: 'product_name', correction_type: 'accepted' }),
    ];

    await createDraftVersionFromCorrections(mockSupabase, corrections, {
      profileId: 'profile-1',
      createdBy: 'user-1',
      brandId: BRAND_ID,
      sourceSlug: SOURCE_SLUG,
      canonicalDomain: CANONICAL_DOMAIN,
    });

    const insertCall = mockSupabase.getInsertData();
    expect(insertCall.rules._meta.correction_count).toBe(3);
    expect(insertCall.rules.corrections.product_image.accepted).toHaveLength(1);
    expect(insertCall.rules.corrections.product_image.rejected).toHaveLength(1);
    expect(insertCall.rules.corrections.product_name.accepted).toHaveLength(1);
  });
});
