import type { CohortBrandOption } from './CohortBrandPicker';

export type CohortBrandInfo = CohortBrandOption;

export function isConfiguredBrand(brand: CohortBrandInfo | null | undefined): boolean {
  if (!brand) {
    return false;
  }

  const officialDomains = brand.official_domains ?? [];
  const preferredDomains = brand.preferred_domains ?? [];

  return Boolean(
    (brand.website_url && brand.website_url.trim())
      || officialDomains.length > 0
      || preferredDomains.length > 0
  );
}
