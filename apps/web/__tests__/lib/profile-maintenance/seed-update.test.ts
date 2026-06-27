/**
 * Unit tests for lib/profile-maintenance/seed-update.ts
 */

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));

const { updateSeedFromVerification, lookupCreatedArtifactId } = require('@/lib/profile-maintenance/seed-update');

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a mock that supports variable-length .eq() chains and is thenable.
 * Each .eq() returns a Promise-like that resolves to the given result.
 * Subsequent .eq() calls on the same promise return the same promise.
 * Extended to support additional tables needed by ensureValidationCaseForSeed.
 */
function makeSeedUpdateMock(result: { error: Error | null } = { error: null }) {
  const resolveValue = result;
  // A thenable object that resolves to the result and has .eq() that returns itself
  const makeThenable = () => {
    const promise = Promise.resolve(resolveValue);
    (promise as any).eq = jest.fn().mockReturnValue(promise);
    return promise;
  };

  const eqFn = jest.fn().mockReturnValue(makeThenable());
  const updateFn = jest.fn().mockReturnValue({ eq: eqFn });

  // Build a chain that supports both query methods AND is thenable
  const makeExtraChain = (returnData: any) => {
    const promise = Promise.resolve(returnData);
    const chain: Record<string, jest.Mock | Function> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(returnData),
      maybeSingle: jest.fn().mockResolvedValue(returnData),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
    };
    return chain;
  };

  const fromFn = jest.fn().mockImplementation((table: string) => {
    if (table === 'product_detail_page_seeds') {
      return {
        update: updateFn,
        select: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'seed-1', url: 'https://example.com/pdp/1', validation_case_id: null }, error: null })),
      };
    }
    if (table === 'site_extraction_profiles') {
      return {
        select: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'prof-1' }, error: null })),
      };
    }
    if (table === 'profile_validation_sets') {
      return {
        select: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'set-1' }, error: null })),
        insert: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'set-1' }, error: null })),
      };
    }
    if (table === 'profile_validation_cases') {
      return {
        insert: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'case-1' }, error: null })),
      };
    }
    return { select: jest.fn().mockReturnValue(makeExtraChain({ data: [], error: null })), update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }), insert: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'case-1' }, error: null })) };
  });

  return { mockClient: { from: fromFn }, updateFn, eqFn };
}

// =============================================================================
// updateSeedFromVerification
// =============================================================================

describe('updateSeedFromVerification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates seed to verified with trusted status and artifact id', async () => {
    const { mockClient, updateFn } = makeSeedUpdateMock();

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      { pdp_seed_id: 'seed-1' },
      { verification_status: 'verified', page_classification: 'product_detail_page' },
      'artifact-1',
    );

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        trust_status: 'verified',
        verified_at: expect.any(String),
        verification_artifact_id: 'artifact-1',
      }),
    );
  });

  it('does NOT update to verified when page_classification is not product_detail_page', async () => {
    const { mockClient, updateFn } = makeSeedUpdateMock();

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      { pdp_seed_id: 'seed-1' },
      { verification_status: 'verified', page_classification: 'category_page' },
      'artifact-1',
    );

    // Should not update because page_classification is not 'product_detail_page'
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('does NOT update to verified when page_classification is missing entirely', async () => {
    const { mockClient, updateFn } = makeSeedUpdateMock();

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      { pdp_seed_id: 'seed-1' },
      { verification_status: 'verified' }, // no page_classification at all
      'artifact-1',
    );

    // Should not update because there is no PDP evidence
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('sets trust_status to rejected without verified_at', async () => {
    const { mockClient, updateFn } = makeSeedUpdateMock();

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      { pdp_seed_id: 'seed-1' },
      { verification_status: 'rejected', rejection_reason: 'not a PDP' },
      'artifact-2',
    );

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        trust_status: 'rejected',
        verification_artifact_id: 'artifact-2',
      }),
    );
    // Should NOT include verified_at
    const updateArg = updateFn.mock.calls[0][0];
    expect(updateArg.verified_at).toBeUndefined();
  });

  it('sets trust_status to expired', async () => {
    const { mockClient, updateFn } = makeSeedUpdateMock();

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      { pdp_seed_id: 'seed-1' },
      { verification_status: 'expired' },
      'artifact-3',
    );

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        trust_status: 'expired',
        verification_artifact_id: 'artifact-3',
      }),
    );
  });

  it('is no-op when pdp_seed_id is missing', async () => {
    const { mockClient, updateFn } = makeSeedUpdateMock();

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      { url: 'https://example.com/pdp' },
      { verification_status: 'verified' },
      'artifact-1',
    );

    expect(updateFn).not.toHaveBeenCalled();
  });

  it('is no-op when verification_status is unknown', async () => {
    const { mockClient, updateFn } = makeSeedUpdateMock();

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      { pdp_seed_id: 'seed-1' },
      { verification_status: 'unknown_value' },
      'artifact-1',
    );

    expect(updateFn).not.toHaveBeenCalled();
  });

  it('is no-op when verification_status is missing', async () => {
    const { mockClient, updateFn } = makeSeedUpdateMock();

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      { pdp_seed_id: 'seed-1' },
      { page_classification: 'product_detail_page' },
      'artifact-1',
    );

    expect(updateFn).not.toHaveBeenCalled();
  });

  it('is no-op when artifactId is null because durable evidence is required', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { mockClient, updateFn } = makeSeedUpdateMock();

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      { pdp_seed_id: 'seed-1' },
      { verification_status: 'verified' },
      null,
    );

    expect(updateFn).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing durable artifact id'),
    );
    warnSpy.mockRestore();
  });

  it('includes scope filters when payload has brand_id/source_slug/canonical_domain', async () => {
    const { mockClient } = makeSeedUpdateMock();

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      {
        pdp_seed_id: 'seed-1',
        brand_id: 'brand-1',
        source_slug: 'test-brand',
        canonical_domain: 'example.com',
      },
      { verification_status: 'verified', page_classification: 'product_detail_page' },
      'artifact-1',
    );

    // Verify the from table was called
    expect(mockClient.from).toHaveBeenCalledWith('product_detail_page_seeds');
  });

  it('logs warning (via console.warn) when DB update fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { mockClient } = makeSeedUpdateMock({ error: new Error('DB constraint violation') });

    await updateSeedFromVerification(
      mockClient,
      'job-1',
      { pdp_seed_id: 'seed-1' },
      { verification_status: 'verified', page_classification: 'product_detail_page' },
      'artifact-1',
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SeedUpdate] Failed to update PDP seed seed-1'),
      'DB constraint violation',
    );
    warnSpy.mockRestore();
  });
});

// =============================================================================
// lookupCreatedArtifactId
// =============================================================================

describe('lookupCreatedArtifactId', () => {
  const mockSupabase = {
    from: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns artifact id when found', async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'artifact-1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await lookupCreatedArtifactId(mockSupabase, 'job-1', 1);
    expect(result).toBe('artifact-1');
  });

  it('returns null when no artifact found', async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await lookupCreatedArtifactId(mockSupabase, 'job-2', 2);
    expect(result).toBeNull();
  });
});

export {};
