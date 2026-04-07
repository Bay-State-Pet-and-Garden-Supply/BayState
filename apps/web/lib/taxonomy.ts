import { buildFacetSlug } from '@/lib/facets/normalization';

export interface TaxonomyCategoryRecord {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  description?: string | null;
  display_order?: number | null;
  image_url?: string | null;
  is_featured?: boolean | null;
}

export interface TaxonomyCategoryNode extends Omit<TaxonomyCategoryRecord, 'slug' | 'description' | 'display_order' | 'image_url' | 'is_featured'> {
  slug: string;
  description: string | null;
  display_order: number | null;
  image_url: string | null;
  is_featured: boolean | null;
  depth: number;
  breadcrumb: string;
  ancestor_ids: string[];
  ancestor_slugs: string[];
  ancestor_names: string[];
  is_leaf: boolean;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeLookupValue(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

export function normalizeTaxonomyBreadcrumb(value: string): string {
  return collapseWhitespace(value)
    .replace(/\s*>\s*/g, ' > ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTaxonomyValues(
  value: string | string[] | null | undefined
): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => (typeof entry === 'string' ? normalizeTaxonomyBreadcrumb(entry) : ''))
          .filter(Boolean)
      )
    );
  }

  if (typeof value !== 'string') {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split('|')
        .map((entry) => normalizeTaxonomyBreadcrumb(entry))
        .filter(Boolean)
    )
  );
}

export function buildTaxonomyNodes(
  categories: TaxonomyCategoryRecord[]
): TaxonomyCategoryNode[] {
  const recordsById = new Map<string, TaxonomyCategoryRecord>();
  const childCountByParentId = new Map<string, number>();
  const nodeCache = new Map<string, TaxonomyCategoryNode>();

  for (const category of categories) {
    recordsById.set(category.id, category);

    if (category.parent_id) {
      childCountByParentId.set(
        category.parent_id,
        (childCountByParentId.get(category.parent_id) ?? 0) + 1
      );
    }
  }

  const buildNode = (
    categoryId: string,
    path: Set<string> = new Set()
  ): TaxonomyCategoryNode => {
    const cached = nodeCache.get(categoryId);
    if (cached) {
      return cached;
    }

    const category = recordsById.get(categoryId);
    if (!category) {
      throw new Error(`Unknown taxonomy category: ${categoryId}`);
    }

    if (path.has(categoryId)) {
      throw new Error(`Cycle detected in taxonomy hierarchy at category ${categoryId}`);
    }

    const nextPath = new Set(path);
    nextPath.add(categoryId);

    const parentNode =
      category.parent_id && recordsById.has(category.parent_id)
        ? buildNode(category.parent_id, nextPath)
        : null;

    const name = collapseWhitespace(category.name);
    const slug = category.slug && category.slug.trim().length > 0
      ? category.slug.trim()
      : buildFacetSlug(name);

    const node: TaxonomyCategoryNode = {
      ...category,
      name,
      slug,
      description: category.description ?? null,
      display_order: category.display_order ?? null,
      image_url: category.image_url ?? null,
      is_featured: category.is_featured ?? null,
      depth: parentNode ? parentNode.depth + 1 : 0,
      breadcrumb: parentNode ? `${parentNode.breadcrumb} > ${name}` : name,
      ancestor_ids: parentNode ? [...parentNode.ancestor_ids, parentNode.id] : [],
      ancestor_slugs: parentNode ? [...parentNode.ancestor_slugs, parentNode.slug] : [],
      ancestor_names: parentNode ? [...parentNode.ancestor_names, parentNode.name] : [],
      is_leaf: (childCountByParentId.get(category.id) ?? 0) === 0,
    };

    nodeCache.set(categoryId, node);
    return node;
  };

  return categories
    .map((category) => buildNode(category.id))
    .sort((left, right) => {
      const leftOrder = left.display_order ?? 0;
      const rightOrder = right.display_order ?? 0;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }

      return left.breadcrumb.localeCompare(right.breadcrumb);
    });
}

export function getLeafTaxonomyNodes(
  categories: TaxonomyCategoryRecord[]
): TaxonomyCategoryNode[] {
  return buildTaxonomyNodes(categories)
    .filter((category) => category.is_leaf)
    .sort((left, right) => left.breadcrumb.localeCompare(right.breadcrumb));
}

export function resolveTaxonomySelections(
  values: string[],
  categories: TaxonomyCategoryRecord[]
): {
  matched: TaxonomyCategoryNode[];
  unresolved: string[];
} {
  const nodes = buildTaxonomyNodes(categories);
  const byId = new Map<string, TaxonomyCategoryNode>();
  const bySlug = new Map<string, TaxonomyCategoryNode>();
  const byBreadcrumb = new Map<string, TaxonomyCategoryNode>();
  const byUniqueName = new Map<string, TaxonomyCategoryNode>();
  const duplicateNames = new Set<string>();

  for (const node of nodes) {
    byId.set(node.id, node);
    bySlug.set(normalizeLookupValue(node.slug.replace(/^\/+/, '')), node);
    byBreadcrumb.set(normalizeLookupValue(normalizeTaxonomyBreadcrumb(node.breadcrumb)), node);

    const normalizedName = normalizeLookupValue(node.name);
    if (byUniqueName.has(normalizedName)) {
      duplicateNames.add(normalizedName);
      byUniqueName.delete(normalizedName);
    } else if (!duplicateNames.has(normalizedName)) {
      byUniqueName.set(normalizedName, node);
    }
  }

  const matched = new Map<string, TaxonomyCategoryNode>();
  const unresolved: string[] = [];

  for (const rawValue of values) {
    const normalizedValue = normalizeLookupValue(
      normalizeTaxonomyBreadcrumb(rawValue).replace(/^\/+/, '')
    );

    if (!normalizedValue) {
      continue;
    }

    const node =
      byId.get(rawValue.trim()) ||
      byBreadcrumb.get(normalizedValue) ||
      bySlug.get(normalizedValue) ||
      byUniqueName.get(normalizedValue);

    if (!node) {
      unresolved.push(rawValue);
      continue;
    }

    matched.set(node.id, node);
  }

  return {
    matched: Array.from(matched.values()).sort((left, right) =>
      left.breadcrumb.localeCompare(right.breadcrumb)
    ),
    unresolved,
  };
}

export function serializeTaxonomySelections(
  categories: TaxonomyCategoryNode[]
): string {
  return categories.map((category) => category.breadcrumb).join('|');
}
