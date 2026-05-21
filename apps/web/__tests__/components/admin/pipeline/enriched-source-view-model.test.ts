/**
 * @jest-environment node
 */

import {
  buildProcessedSourceItems,
  formatPipelineSourceSlug,
} from '@/components/admin/pipeline/enriched-source-view-model';

describe('formatPipelineSourceSlug', () => {
  it('maps known distributor slugs to friendly names', () => {
    expect(formatPipelineSourceSlug('phillips')).toBe('Phillips Pet');
    expect(formatPipelineSourceSlug('pet_food_experts')).toBe('Pet Food Experts');
    expect(formatPipelineSourceSlug('central_pet')).toBe('Central Pet');
  });
});

describe('buildProcessedSourceItems', () => {
  it('does not render a legacy enriched summary tab without per-source success snapshots', () => {
    const items = buildProcessedSourceItems({
      enriched: {
        source_results: [
          { sourceSlug: 'phillips', sourceType: 'distributor', confidence: 1 },
          { sourceSlug: 'orgill', sourceType: 'distributor', confidence: 0.5 },
        ],
      },
    });

    expect(items).toEqual([]);
  });

  it('creates separate tabs for successful approved source snapshots and hides summary clutter', () => {
    const items = buildProcessedSourceItems({
      enriched: {
        active_source_slug: 'phillips',
        approved_sources: {
          phillips: {
            name: 'Phillips Product',
            extracted: { name: 'Phillips Product' },
            confidence: { overall: 1, fields: {} },
            validation: {},
            attempts: [],
            mode: 'mixed',
            extracted_at: '2026-05-21T00:00:00.000Z',
            schema_version: 'v1',
            source_kind: 'enriched',
            url: 'https://phillips.test',
            confidence_score: 1,
          },
          orgill: {
            name: 'Orgill Product',
            extracted: { name: 'Orgill Product' },
            confidence: { overall: 0.9, fields: {} },
            validation: {},
            attempts: [],
            mode: 'mixed',
            extracted_at: '2026-05-21T00:00:00.000Z',
            schema_version: 'v1',
            source_kind: 'enriched',
            url: 'https://orgill.test',
            confidence_score: 0.9,
          },
        },
      },
    });

    expect(items.map((item) => item.key)).toEqual([
      'enriched:phillips',
      'enriched:orgill',
    ]);
    expect(items[0]).toMatchObject({
      key: 'enriched:phillips',
      label: 'Phillips Pet',
      isDefault: true,
      isVirtual: true,
      deleteSourceKey: null,
    });
  });

  it('preserves non-enriched raw sources as deletable tabs', () => {
    const items = buildProcessedSourceItems({
      bradley: { name: 'Bradley Raw' },
      enriched: {
        active_source_slug: 'phillips',
        approved_sources: {
          phillips: {
            name: 'Phillips Product',
            extracted: { name: 'Phillips Product' },
            confidence: { overall: 1, fields: {} },
            validation: {},
            attempts: [],
            mode: 'mixed',
            extracted_at: '2026-05-21T00:00:00.000Z',
            schema_version: 'v1',
            source_kind: 'enriched',
            url: 'https://phillips.test',
            confidence_score: 1,
          },
        },
      },
    });

    const bradley = items.find((item) => item.key === 'bradley');
    expect(bradley).toMatchObject({
      key: 'bradley',
      label: 'Bradley Caldwell',
      deleteSourceKey: 'bradley',
      isEnriched: false,
    });
  });

  it('does not duplicate tabs when a top-level successful source already exists', () => {
    const items = buildProcessedSourceItems({
      phillips: { name: 'Phillips Raw' },
      enriched: {
        active_source_slug: 'phillips',
        approved_sources: {
          phillips: {
            name: 'Phillips Product',
            extracted: { name: 'Phillips Product' },
            confidence: { overall: 1, fields: {} },
            validation: {},
            attempts: [],
            mode: 'mixed',
            extracted_at: '2026-05-21T00:00:00.000Z',
            schema_version: 'v1',
            source_kind: 'enriched',
            url: 'https://phillips.test',
            confidence_score: 1,
          },
          orgill: {
            name: 'Orgill Product',
            extracted: { name: 'Orgill Product' },
            confidence: { overall: 0.9, fields: {} },
            validation: {},
            attempts: [],
            mode: 'mixed',
            extracted_at: '2026-05-21T00:00:00.000Z',
            schema_version: 'v1',
            source_kind: 'enriched',
            url: 'https://orgill.test',
            confidence_score: 0.9,
          },
        },
      },
    });

    expect(items.map((item) => item.key)).toEqual([
      'phillips',
      'enriched:orgill',
    ]);
  });

  it('filters out failed or empty approved source snapshots', () => {
    const items = buildProcessedSourceItems({
      enriched: {
        active_source_slug: 'phillips',
        approved_sources: {
          phillips: {
            name: 'Phillips Product',
            extracted: { name: 'Phillips Product' },
            confidence: { overall: 1, fields: {} },
            validation: {},
            attempts: [],
            mode: 'mixed',
            extracted_at: '2026-05-21T00:00:00.000Z',
            schema_version: 'v1',
            source_kind: 'enriched',
            url: 'https://phillips.test',
            confidence_score: 1,
          },
          central_pet: {
            extracted: {},
            confidence: { overall: 0, fields: {} },
            validation: { warnings: ['NO_MATCH'] },
            attempts: [{ mode: 'structured', status: 'failed', error: 'No match' }],
            mode: 'mixed',
            extracted_at: '2026-05-21T00:00:00.000Z',
            schema_version: 'v1',
            source_kind: 'enriched',
            url: 'https://central.test',
            confidence_score: 0,
          },
        },
      },
    });

    expect(items.map((item) => item.key)).toEqual(['enriched:phillips']);
  });
});
