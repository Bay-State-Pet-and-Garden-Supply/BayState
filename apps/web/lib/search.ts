import Fuse from 'fuse.js';
import { type Product, type Service, type Brand } from '@/lib/data';

export interface SearchResult {
  type: 'product' | 'service' | 'brand';
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price?: number | null;
  imageUrl?: string | null;
}

interface SearchableItem {
  type: 'product' | 'service' | 'brand';
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  brandName?: string | null;
}

/**
 * Creates a fuzzy search index from products, services, and brands.
 */
export function createSearchIndex(
  products: Product[],
  services: Service[],
  brands: Brand[]
): Fuse<SearchableItem> {
  const searchableItems: SearchableItem[] = [
    ...products.map((p) => ({
      type: 'product' as const,
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: p.price,
      imageUrl: p.images?.[0] || null,
      brandName: p.brand?.name || null,
    })),
    ...services.map((s) => ({
      type: 'service' as const,
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      price: s.price,
    })),
    ...brands.map((b) => ({
      type: 'brand' as const,
      id: b.id,
      name: b.name,
      slug: b.slug,
      imageUrl: b.logo_url,
    })),
  ];

  return new Fuse(searchableItems, {
    keys: [
      { name: 'name', weight: 2 },
      { name: 'description', weight: 1 },
      { name: 'brandName', weight: 1.5 },
    ],
    threshold: 0.4, // Lower = stricter matching
    distance: 100,
    includeScore: true,
    minMatchCharLength: 2,
  });
}

/**
 * Performs fuzzy search across all indexed items.
 */
export function fuzzySearch(
  index: Fuse<SearchableItem>,
  query: string,
  limit = 10
): SearchResult[] {
  if (!query || query.length < 2) {
    return [];
  }

  const results = index.search(query, { limit });

  return results.map((result) => ({
    type: result.item.type,
    id: result.item.id,
    name: result.item.name,
    slug: result.item.slug,
    description: result.item.description,
    price: result.item.price,
    imageUrl: result.item.imageUrl,
  }));
}
