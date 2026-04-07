/**
 * @jest-environment node
 */

import {
  buildTaxonomyNodes,
  parseTaxonomyValues,
  resolveTaxonomySelections,
  type TaxonomyCategoryRecord,
} from '@/lib/taxonomy';

const taxonomyFixture: TaxonomyCategoryRecord[] = [
  {
    id: 'dog',
    name: 'Dog',
    slug: 'dog',
    parent_id: null,
    display_order: 10,
  },
  {
    id: 'dog-food',
    name: 'Food',
    slug: 'dog-food',
    parent_id: 'dog',
    display_order: 10,
  },
  {
    id: 'dog-food-dry',
    name: 'Dry Food',
    slug: 'dog-food-dry-food',
    parent_id: 'dog-food',
    display_order: 10,
  },
  {
    id: 'cat',
    name: 'Cat',
    slug: 'cat',
    parent_id: null,
    display_order: 20,
  },
  {
    id: 'cat-food',
    name: 'Food',
    slug: 'cat-food',
    parent_id: 'cat',
    display_order: 10,
  },
  {
    id: 'cat-food-dry',
    name: 'Dry Food',
    slug: 'cat-food-dry-food',
    parent_id: 'cat-food',
    display_order: 10,
  },
];

describe('taxonomy helpers', () => {
  it('builds breadcrumbs and leaf metadata from hierarchical categories', () => {
    const nodes = buildTaxonomyNodes(taxonomyFixture);
    const dryFoodNode = nodes.find((node) => node.id === 'dog-food-dry');

    expect(dryFoodNode).toEqual(
      expect.objectContaining({
        breadcrumb: 'Dog > Food > Dry Food',
        depth: 2,
        is_leaf: true,
        ancestor_ids: ['dog', 'dog-food'],
        ancestor_names: ['Dog', 'Food'],
      })
    );
  });

  it('normalizes breadcrumb delimiters when parsing taxonomy values', () => {
    expect(
      parseTaxonomyValues('Dog>Food>Dry Food| Dog > Food > Dry Food |cat-food-dry-food')
    ).toEqual(['Dog > Food > Dry Food', 'cat-food-dry-food']);
  });

  it('resolves taxonomy selections by breadcrumb and slug but rejects ambiguous duplicate names', () => {
    const result = resolveTaxonomySelections(
      ['Dog > Food > Dry Food', 'cat-food-dry-food', 'Dry Food'],
      taxonomyFixture
    );

    expect(result.matched.map((node) => node.id)).toEqual(['cat-food-dry', 'dog-food-dry']);
    expect(result.unresolved).toEqual(['Dry Food']);
  });
});
