import {
  calculateCompleteness,
  calculateTaxonomyCorrectness,
  compareConsolidationResults,
  summarizeComparisons,
} from '@/lib/consolidation/evaluation';

describe('consolidation evaluation helpers', () => {
  it('calculates completeness from populated fields', () => {
    expect(
      calculateCompleteness({
        name: 'Acme Kibble',
        brand: 'Acme',
        description: 'Dry food',
        long_description: 'Dry food for adult dogs',
        search_keywords: 'dog food, kibble',
        category: 'Dog Food',
        product_on_pages: 'Dogs',
      })
    ).toBeCloseTo(7 / 8, 5);
  });

  it('compares expected and actual consolidation outputs', () => {
    const comparison = compareConsolidationResults(
      {
        name: 'Acme Kibble',
        brand: 'Acme',
        weight: '5',
        description: 'Dry food',
        long_description: 'Dry food for adult dogs',
        search_keywords: 'dog food, kibble',
        category: 'Dog Food',
        product_on_pages: 'Dogs',
        confidence_score: 0.9,
      },
      {
        name: 'Acme Kibble',
        brand: 'Acme',
        weight: '5',
        description: 'Dry food',
        long_description: 'Dry food for adult dogs',
        search_keywords: 'dog food, kibble',
        category: 'Dog Food',
        product_on_pages: 'Dogs',
        confidence_score: 0.7,
      }
    );

    expect(comparison.accuracy).toBeCloseTo(8 / 9, 5);
    expect(comparison.mismatched_fields).toEqual(['confidence_score']);
    expect(calculateTaxonomyCorrectness(
      { category: 'Dog Food', product_on_pages: 'Dogs' },
      { category: 'Dog Food', product_on_pages: 'Dogs' }
    )).toBe(1);
  });

  it('summarizes multiple comparisons', () => {
    const summary = summarizeComparisons([
      {
        accuracy: 1,
        completeness: 1,
        taxonomy_correctness: 1,
        mismatch_count: 0,
        compared_count: 9,
        mismatched_fields: [],
      },
      {
        accuracy: 0.5,
        completeness: 0.75,
        taxonomy_correctness: 0.5,
        mismatch_count: 4,
        compared_count: 9,
        mismatched_fields: ['category', 'description'],
      },
    ]);

    expect(summary.accuracy).toBeCloseTo(0.75, 5);
    expect(summary.completeness).toBeCloseTo(0.875, 5);
    expect(summary.taxonomy_correctness).toBeCloseTo(0.75, 5);
    expect(summary.mismatched_fields).toEqual(['category', 'description']);
  });
});
