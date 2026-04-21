import type { CohortBrandOption } from './CohortBrandPicker';

export type CohortBrandInfo = CohortBrandOption;

export function isConfiguredBrand(brand: CohortBrandInfo | null | undefined): boolean {
  if (!brand) {
    return false;
  }

  return Boolean(
    (brand.website_url && brand.website_url.trim())
      || brand.official_domains.length > 0
      || brand.preferred_domains.length > 0
  );
}
