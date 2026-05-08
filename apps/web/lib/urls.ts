/**
 * Storefront URL helpers — single source of truth for all customer-facing routes.
 *
 * Category pages:  /c/<slug>
 * Brand pages:     /b/<slug>
 * Product pages:   /products/<slug>
 */

/**
 * Returns the canonical URL for a category page.
 *
 * @example getCategoryUrl('dog-food') => '/c/dog-food'
 */
export function getCategoryUrl(slug: string | null | undefined): string {
  if (!slug) return '/products';
  return `/c/${slug}`;
}

/**
 * Returns the canonical URL for a brand listing page.
 *
 * @example getBrandUrl('purina') => '/b/purina'
 */
export function getBrandUrl(slug: string): string {
  return `/b/${slug}`;
}

/**
 * Returns the canonical URL for a product detail page.
 *
 * @example getProductUrl('purina-pro-plan-30lb') => '/products/purina-pro-plan-30lb'
 */
export function getProductUrl(slug: string): string {
  return `/products/${slug}`;
}
