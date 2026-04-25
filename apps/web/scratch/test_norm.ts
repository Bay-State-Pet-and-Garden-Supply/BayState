import { normalizeCategoryValue, normalizeProductTypeValue } from '../lib/facets/normalization';
import { getMappedCategorySlug } from '../lib/facets/category-mapping';

console.log("Cat:", normalizeCategoryValue("Barn Supplies"));
console.log("Type:", normalizeProductTypeValue("Buckets & Feeders"));
console.log("Slug:", getMappedCategorySlug(normalizeCategoryValue("Barn Supplies"), normalizeProductTypeValue("Buckets & Feeders")));