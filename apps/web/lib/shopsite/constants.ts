/**
 * ShopSite Constants
 *
 * Configuration constants for ShopSite XML export.
 * Based on the current Bay State ShopSite sample export (DTD 2.9 / version 15.0)
 * and field mappings from BayStateTools.
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
 */
export const MAX_MORE_INFO_IMAGES = 20;

/**
 * ShopSite XML version for the export format.
 */
export const SHOPSITE_XML_VERSION = '15.0';

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
 * - MoreInfoImage1-20: Additional images shown on the detail page
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
        'MoreInfoImage8',
        'MoreInfoImage9',
        'MoreInfoImage10',
        'MoreInfoImage11',
        'MoreInfoImage12',
        'MoreInfoImage13',
        'MoreInfoImage14',
        'MoreInfoImage15',
        'MoreInfoImage16',
        'MoreInfoImage17',
        'MoreInfoImage18',
        'MoreInfoImage19',
        'MoreInfoImage20',
    ] as const,
};
