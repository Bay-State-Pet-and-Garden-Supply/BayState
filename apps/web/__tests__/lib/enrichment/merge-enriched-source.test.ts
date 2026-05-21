/**
 * @jest-environment node
 */

import { mergeEnrichedSource } from '@/lib/enrichment/merge-enriched-source';
import type { NormalizedEnrichedSourceV1 } from '@/lib/enrichment/contracts';

function makeEnrichedSource(options: {
  sourceSlug: string;
  sourceType?: string;
  name?: string | null;
  images?: string[];
  confidence?: number;
  extractedAt?: string;
  requestedExtractionMode?: 'mixed' | 'distributor_only' | 'ai_only' | null;
  warnings?: string[];
}): NormalizedEnrichedSourceV1 {
  const confidence = options.confidence ?? 0.9;
  const extractedAt = options.extractedAt ?? '2026-05-20T00:00:00.000Z';
  const name = options.name !== undefined ? options.name : `${options.sourceSlug} product`;
  const images = options.images !== undefined ? options.images : ['https://example.com/image.jpg'];

  return {
    schema_version: 'v1',
    source_kind: 'enriched',
    title: name,
    name,
    brand: 'Test Brand',
    description: name ? `${name} description` : null,
    category: 'Cat Food',
    weight: '3 oz',
    images,
    image_urls: images,
    url: `https://example.com/${options.sourceSlug}`,
    confidence_score: confidence,
    decision: confidence >= 0.6 ? 'deterministic_success' : 'failed',
    llm_used: false,
    requested_extraction_mode: options.requestedExtractionMode ?? null,
    source_slug: options.sourceSlug,
    source_type: options.sourceType ?? 'distributor',
    source_label: options.sourceSlug,
    active_source_slug: options.sourceSlug,
    source_results: [
      {
        sourceSlug: options.sourceSlug,
        sourceType: options.sourceType ?? 'distributor',
        confidence,
        matchedFields: ['name', 'images'],
        evidenceUrl: `https://example.com/${options.sourceSlug}`,
      },
    ],
    extracted: {
      name,
      brand: 'Test Brand',
      description: name ? `${name} description` : null,
      category: 'Cat Food',
      weight: '3 oz',
      image_urls: images,
    },
    confidence: {
      overall: confidence,
      fields: {},
    },
    validation: {
      sku_match: true,
      warnings: options.warnings ?? [],
      missing_required: [],
    },
    attempts: [
      {
        mode: 'structured',
        status: confidence >= 0.6 ? 'success' : 'failed',
        error: confidence >= 0.6 ? null : 'Failed',
      },
    ],
    model: null,
    mode: 'mixed',
    extracted_at: extractedAt,
  };
}

describe('mergeEnrichedSource', () => {
  it('preserves per-source snapshots and promotes the latest successful source', () => {
    const existing = makeEnrichedSource({
      sourceSlug: 'phillips',
      requestedExtractionMode: 'distributor_only',
      extractedAt: '2026-05-19T00:00:00.000Z',
    });
    const incoming = makeEnrichedSource({
      sourceSlug: 'orgill',
      requestedExtractionMode: 'distributor_only',
      extractedAt: '2026-05-20T00:00:00.000Z',
      confidence: 0.95,
    });

    const merged = mergeEnrichedSource(existing, incoming, {
      incomingStatus: 'success',
    });

    expect(merged.active_source_slug).toBe('orgill');
    expect(merged.name).toBe('orgill product');
    expect(merged.approved_sources?.phillips?.name).toBe('phillips product');
    expect(merged.approved_sources?.orgill?.name).toBe('orgill product');
    expect(merged.source_results?.map((result) => result.sourceSlug).sort()).toEqual(['orgill', 'phillips']);
  });

  it('preserves an existing useful snapshot when a later failed callback arrives', () => {
    const existing = makeEnrichedSource({
      sourceSlug: 'phillips',
      requestedExtractionMode: 'distributor_only',
      extractedAt: '2026-05-19T00:00:00.000Z',
    });
    const failedIncoming = makeEnrichedSource({
      sourceSlug: 'orgill',
      name: null,
      images: [],
      confidence: 0,
      requestedExtractionMode: 'distributor_only',
      warnings: ['AUTH_REQUIRED: login required'],
    });

    const merged = mergeEnrichedSource(existing, failedIncoming, {
      incomingStatus: 'failed',
    });

    expect(merged.active_source_slug).toBe('phillips');
    expect(merged.name).toBe('phillips product');
    expect(merged.approved_sources?.orgill?.validation.warnings).toContain('AUTH_REQUIRED: login required');
    expect(merged.source_results?.some((result) => result.sourceSlug === 'phillips')).toBe(true);
  });

  it('bootstraps a legacy collapsed record into approved_sources', () => {
    const legacy = makeEnrichedSource({
      sourceSlug: 'phillips',
      requestedExtractionMode: 'distributor_only',
    });
    delete legacy.approved_sources;

    const incoming = makeEnrichedSource({
      sourceSlug: 'orgill',
      requestedExtractionMode: 'distributor_only',
    });

    const merged = mergeEnrichedSource(legacy, incoming, {
      incomingStatus: 'success',
    });

    expect(merged.approved_sources?.phillips).toBeDefined();
    expect(merged.approved_sources?.orgill).toBeDefined();
  });
});
