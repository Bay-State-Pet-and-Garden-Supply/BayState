/**
 * ShopSite Constants
 *
 * Configuration constants for ShopSite XML export.
 * Based on ShopSite DTD v1.9 and field mappings from BayStateTools.
 */

/**
 * ShopSite store pages that products can be assigned to.
 * These correspond to the navigation categories on the ShopSite storefront.
 */
export const SHOPSITE_PAGES = [
    'Home',
    'Dog Food',
    'Cat Food',
    'Bird Supplies',
    'Small Pet Food',
    'Farm Animal Supplies',
    'Pet Toys',
    'Pet Healthcare',
    'Pet Grooming',
    'Pet Beds',
    'Pet Bowls',
    'Hardware',
    'Lawn & Garden',
    'Farm Supplies',
    'Home & Kitchen',
    'Automotive',
] as const;

export type ShopSitePage = (typeof SHOPSITE_PAGES)[number];

/**
 * Maximum number of additional images ShopSite supports (MoreInfoImage1-20).
 * We cap at 7 to keep uploads manageable and match the old BayStateTools behavior.
 */
export const MAX_MORE_INFO_IMAGES = 7;

/**
 * ShopSite XML version for the export format.
 */
export const SHOPSITE_XML_VERSION = '14.0';

/**
 * ShopSite custom field mappings.
 * Maps custom ProductField numbers to their business meanings.
 */
export const SHOPSITE_FIELD_MAP = {
    ProductField11: 'Special_Order',
    ProductField16: 'Brand',
    ProductField24: 'Category',
    ProductField25: 'Product_Type',
} as const;

/**
 * ShopSite image field mappings.
 *
 * - Graphic: Main product image shown on category/listing pages (thumbnail)
 * - MoreInformationGraphic: Main product image on the detail page
 * - MoreInfoImage1-7: Additional images shown on the detail page
 *
 * Both Graphic and MoreInformationGraphic use the first product image.
 */
export const IMAGE_FIELD_MAPPING = {
    primary: ['Graphic', 'MoreInformationGraphic'] as const,
    additional: [
        'MoreInfoImage1',
        'MoreInfoImage2',
        'MoreInfoImage3',
        'MoreInfoImage4',
        'MoreInfoImage5',
        'MoreInfoImage6',
        'MoreInfoImage7',
    ] as const,
};
