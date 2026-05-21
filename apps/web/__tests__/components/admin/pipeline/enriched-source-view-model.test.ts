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
  it('keeps legacy enriched records as a single enriched tab', () => {
    const items = buildProcessedSourceItems({
      enriched: {
        source_results: [
          { sourceSlug: 'phillips', sourceType: 'distributor', confidence: 1 },
          { sourceSlug: 'orgill', sourceType: 'distributor', confidence: 0.5 },
        ],
      },
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: 'enriched',
      isEnriched: true,
      isVirtual: false,
      isDefault: true,
    });
    expect(items[0]?.label).toContain('Enriched');
    expect(items[0]?.label).toContain('Phillips Pet');
    expect(items[0]?.label).toContain('Orgill');
  });

  it('creates separate virtual tabs for approved source snapshots plus a summary tab', () => {
    const items = buildProcessedSourceItems({
      enriched: {
        active_source_slug: 'phillips',
        approved_sources: {
          phillips: { name: 'Phillips Product' },
          orgill: { name: 'Orgill Product' },
        },
      },
    });

    expect(items.map((item) => item.key)).toEqual([
      'enriched:phillips',
      'enriched:orgill',
      'enriched:summary',
    ]);
    expect(items[0]).toMatchObject({
      key: 'enriched:phillips',
      label: 'Phillips Pet (Enriched)',
      isDefault: true,
      isVirtual: true,
      deleteSourceKey: null,
    });
    expect(items[2]).toMatchObject({
      key: 'enriched:summary',
      label: 'Enriched Summary',
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
          phillips: { name: 'Phillips Product' },
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

  it('does not duplicate virtual enriched tabs when a top-level source key already exists', () => {
    const items = buildProcessedSourceItems({
      phillips: { name: 'Phillips Raw' },
      enriched: {
        active_source_slug: 'phillips',
        approved_sources: {
          phillips: { name: 'Phillips Product' },
          orgill: { name: 'Orgill Product' },
        },
      },
    });

    expect(items.map((item) => item.key)).toEqual([
      'phillips',
      'enriched:orgill',
      'enriched:summary',
    ]);
  });
});
