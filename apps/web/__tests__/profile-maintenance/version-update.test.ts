/**
 * Tests for version-update helpers (updateVersionFromDraft, updateValidationRunFromValidation)
 */

import { updateVersionFromDraft, updateValidationRunFromValidation } from '@/lib/profile-maintenance/version-update';

describe('updateVersionFromDraft', () => {
  let mockSupabase: any;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  function makeMockSupabase(options?: {
    latestVersionNumber?: number | null;
    insertError?: any;
  }) {
    const { latestVersionNumber = null, insertError = null } = options ?? {};

    const latestVersionMaybeSingle = jest.fn().mockResolvedValue({
      data: latestVersionNumber ? { version_number: latestVersionNumber } : null,
      error: null,
    });
    const latestVersionLimit = jest.fn().mockReturnValue({ maybeSingle: latestVersionMaybeSingle });
    const latestVersionOrder = jest.fn().mockReturnValue({ limit: latestVersionLimit });
    const latestVersionEq = jest.fn().mockReturnValue({ order: latestVersionOrder });
    const latestVersionSelect = jest.fn().mockReturnValue({ eq: latestVersionEq });

    // Pre-create stable mocks so they can be spied on
    const versionInsert = jest.fn().mockResolvedValue({ error: insertError });

    return {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'site_extraction_profile_versions') {
          return {
            select: latestVersionSelect,
            insert: versionInsert,
          };
        }
        return { select: jest.fn(), update: jest.fn(), insert: jest.fn() };
      }),
      // Expose mocks for spying
      _insert: versionInsert,
    };
  }

  it('skips version creation when artifactId is null', async () => {
    const mock = makeMockSupabase();

    await updateVersionFromDraft(
      mock,
      'job-1',
      { profile_id: 'prof-1' },
      {
        artifact_payload: {
          field_evidence_rules: { profile_version: 'v1', fields: [{ name: 'title' }] },
          compiled_crawl4ai_schema: { name: 'test', fields: [] },
          version_hash: 'abc123def456',
        },
      },
      null,
    );

    expect(mock._insert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no durable artifact'),
    );
  });

  it('creates a site_extraction_profile_version row', async () => {
    const mock = makeMockSupabase();

    await updateVersionFromDraft(
      mock,
      'job-1',
      { profile_id: 'prof-1' },
      {
        artifact_payload: {
          field_evidence_rules: { profile_version: 'v1', fields: [{ name: 'title' }] },
          compiled_crawl4ai_schema: { name: 'test', fields: [] },
          version_hash: 'abc123def456',
        },
      },
      'artifact-1',
    );

    expect(mock._insert).toHaveBeenCalled();
    const insertData = mock._insert.mock.calls[0][0];
    expect(insertData.profile_id).toBe('prof-1');
    expect(insertData.version_number).toBe(1);
    expect(insertData.status).toBe('draft');
    expect(insertData.created_from).toBe('ai_schema_draft');
    expect(insertData.rules).toEqual({ profile_version: 'v1', fields: [{ name: 'title' }] });
    expect(insertData.compiled_crawl4ai_schema).toEqual({ name: 'test', fields: [] });
    expect(insertData.version_hash).toBe('abc123def456');
  });

  it('increments version_number correctly', async () => {
    const mock = makeMockSupabase({ latestVersionNumber: 2 });

    await updateVersionFromDraft(
      mock,
      'job-1',
      { profile_id: 'prof-1' },
      {
        artifact_payload: {
          field_evidence_rules: { fields: [] },
          compiled_crawl4ai_schema: { fields: [] },
          version_hash: 'xyz789',
        },
      },
      'artifact-2',
    );

    const insertData = mock._insert.mock.calls[0][0];
    expect(insertData.version_number).toBe(3); // 2 + 1
  });

  it('no-ops if required artifact data missing', async () => {
    const mock = makeMockSupabase();

    await updateVersionFromDraft(
      mock,
      'job-1',
      { profile_id: 'prof-1' },
      { artifact_payload: {} }, // Missing required data
      'artifact-1',
    );

    expect(mock._insert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing required artifact data'),
    );
  });

  it('handles insert error gracefully (non-fatal)', async () => {
    const mock = makeMockSupabase({ insertError: { message: 'DB conflict' } });

    await updateVersionFromDraft(
      mock,
      'job-1',
      { profile_id: 'prof-1' },
      {
        artifact_payload: {
          field_evidence_rules: { fields: [] },
          compiled_crawl4ai_schema: { fields: [] },
          version_hash: 'hash123',
        },
      },
      'artifact-1',
    );

    expect(mock._insert).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create draft version'),
      'DB conflict',
    );
  });
});

describe('updateValidationRunFromValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeMockSupabase() {
    // Pre-create stable mocks so they can be spied on
    const validationRunEq = jest.fn().mockResolvedValue({ error: null });
    const validationRunUpdate = jest.fn().mockReturnValue({ eq: validationRunEq });

    const versionEq2 = jest.fn().mockResolvedValue({ error: null });
    const versionEq1 = jest.fn().mockReturnValue({ eq: versionEq2 });
    const versionUpdate = jest.fn().mockReturnValue({ eq: versionEq1 });

    return {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'profile_validation_runs') {
          return { update: validationRunUpdate };
        }
        if (table === 'site_extraction_profile_versions') {
          return { update: versionUpdate };
        }
        return { select: jest.fn(), update: jest.fn(), insert: jest.fn() };
      }),
      // Expose mocks for spying
      _runUpdate: validationRunUpdate,
      _versionUpdate: versionUpdate,
    };
  }

  it('skips validation run update when artifactId is null', async () => {
    const mock = makeMockSupabase();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await updateValidationRunFromValidation(
      mock,
      'job-1',
      { validation_run_id: 'run-1', profile_version_id: 'pv-1' },
      {
        validation_status: 'passed',
        summary: { total: 5, passed: 5, failed: 0 },
      },
      null,
    );

    expect(mock._runUpdate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no durable artifact'),
    );
    warnSpy.mockRestore();
  });

  it('updates validation run status to passed', async () => {
    const mock = makeMockSupabase();

    await updateValidationRunFromValidation(
      mock,
      'job-1',
      { validation_run_id: 'run-1', profile_version_id: 'pv-1' },
      {
        validation_status: 'passed',
        summary: { total: 5, passed: 5, failed: 0 },
      },
      'artifact-1',
    );

    expect(mock._runUpdate).toHaveBeenCalled();
    const runUpdateData = mock._runUpdate.mock.calls[0][0];
    expect(runUpdateData.status).toBe('passed');
    expect(runUpdateData.summary_artifact_id).toBe('artifact-1');
    expect(runUpdateData.completed_at).toBeDefined();

    expect(mock._versionUpdate).toHaveBeenCalled();
    const versionUpdateData = mock._versionUpdate.mock.calls[0][0];
    expect(versionUpdateData.status).toBe('validating');
  });

  it('updates validation run status to failed', async () => {
    const mock = makeMockSupabase();

    await updateValidationRunFromValidation(
      mock,
      'job-1',
      { validation_run_id: 'run-1', profile_version_id: 'pv-1' },
      {
        validation_status: 'failed',
        summary: { total: 5, passed: 3, failed: 2 },
      },
      'artifact-2',
    );

    expect(mock._runUpdate).toHaveBeenCalled();
    const runUpdateData = mock._runUpdate.mock.calls[0][0];
    expect(runUpdateData.status).toBe('failed');

    expect(mock._versionUpdate).toHaveBeenCalled();
    const versionUpdateData = mock._versionUpdate.mock.calls[0][0];
    expect(versionUpdateData.status).toBe('draft');
  });

  it('no-ops if validation_run_id is missing', async () => {
    const mock = makeMockSupabase();

    await updateValidationRunFromValidation(
      mock,
      'job-1',
      { profile_version_id: 'pv-1' },
      { validation_status: 'passed' },
      'artifact-1',
    );

    expect(mock._runUpdate).not.toHaveBeenCalled();
  });

  it('no-ops if validation_status is invalid', async () => {
    const mock = makeMockSupabase();

    await updateValidationRunFromValidation(
      mock,
      'job-1',
      { validation_run_id: 'run-1', profile_version_id: 'pv-1' },
      { validation_status: 'unknown' },
      'artifact-1',
    );

    expect(mock._runUpdate).not.toHaveBeenCalled();
  });
});

export {};
