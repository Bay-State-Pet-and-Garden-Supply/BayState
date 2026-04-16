/**
 * ShopSite XML Generator
 *
 * Generates a minimal ShopSite upload payload aligned to the current Bay State
 * upload flow (DTD 2.9 / version 15.0).
 *
 * CORRECTED CONTRACT COMPLIANCE:
 * This generator implements the user-approved ProductField mapping contract:
 * - All 18 canonical ProductFields are supported (PF7, PF11, PF15, PF16-27, PF29, PF30, PF32)
 * - ProductField24 is the only canonical category source (PF31 excluded from normalization)
 * - ProductField17 provides canonical pet type values
 * - ProductField32 cross-sells are pipe-delimited
 *
 * @see docs/field-mapping-matrix.md for full contract documentation
 * @see lib/shopsite/constants.ts for field mapping constants
 */

import {
    SHOPSITE_XML_VERSION,
    MAX_MORE_INFO_IMAGES,
} from './constants';

const SHOPSITE_DOCTYPE = 'http://www.shopsite.com/XML/2.9/shopsiteproducts.dtd';
const BAY_STATE_TIMEZONE = 'America/New_York';

export interface ShopSiteExportProduct {
    sku: string;
    name: string;
    price: number | string;
    weight?: string | number | null;
    short_name?: string | null;
    brand_name?: string | null;
    description?: string | null;
    long_description?: string | null;
    images: string[];
    category?: string | null;
    product_type?: string | null;

    shopsite_pages?: string[] | null;
    search_keywords?: string | null;
    is_special_order?: boolean;
    in_store_pickup?: boolean;
    is_taxable?: boolean;
    file_name?: string | null;
    gtin?: string | null;
    availability?: string | null;
    minimum_quantity?: number | null;
    // Canonical facet fields (corrected contract)
    pet_type?: string | null;
    life_stage?: string | null;
    pet_size?: string | null;
    special_diet?: string | null;
    health_feature?: string | null;
    food_form?: string | null;
    flavor?: string | null;
    product_feature?: string | null;
    size?: string | null;
    color?: string | null;
    packaging_type?: string | null;
    cross_sell_skus?: string[] | null;
}

export interface ShopSiteXmlOptions {
    markerDate?: Date;
    newProductTag?: string;
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function cdataWrap(text: string): string {
    const sanitized = text.replace(/\]\]>/g, ']]>]]><![CDATA[');
    return `<![CDATA[${sanitized}]]>`;
}

function xmlElement(tag: string, value: string | null | undefined): string {
    return `    <${tag}>${escapeXml(value ?? '')}</${tag}>`;
}

function xmlCdataElement(tag: string, value: string): string {
    return `    <${tag}>${cdataWrap(value)}</${tag}>`;
}

function formatPrice(value: string | number): string {
    if (typeof value === 'number') {
        return value.toFixed(2);
    }

    return value;
}

function getEasternDateParts(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: BAY_STATE_TIMEZONE,
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';
    const year = parts.find((part) => part.type === 'year')?.value ?? '00';

    return { month, day, year };
}

export function buildShopSiteNewProductTag(date: Date = new Date()): string {
    const { month, day, year } = getEasternDateParts(date);
    return `new${month}${day}${year}`;
}

function generateProductXml(product: ShopSiteExportProduct, newProductTag: string): string {
    const lines: string[] = [];
    lines.push('  <Product>');
    lines.push(xmlElement('Name', product.name));
    lines.push(xmlElement('SKU', product.sku));
    lines.push(xmlElement('Price', formatPrice(product.price)));
    lines.push(xmlElement('ProductField1', newProductTag));

    const description = product.description ?? product.long_description ?? null;
    if (description) {
        lines.push(xmlCdataElement('ProductDescription', description));
    }

    if (product.weight != null && product.weight !== '') {
        lines.push(xmlElement('Weight', String(product.weight)));
    }

    if (product.short_name) {
        lines.push(xmlElement('ProductField7', product.short_name));
    }

    const primaryImage = product.images[0] ?? null;
    if (primaryImage) {
        lines.push(xmlElement('Graphic', primaryImage));
        lines.push(xmlElement('MoreInformationGraphic', primaryImage));
    }

    const additionalImages = product.images.slice(1, 1 + MAX_MORE_INFO_IMAGES);
    for (let index = 0; index < additionalImages.length; index += 1) {
        lines.push(xmlElement(`MoreInfoImage${index + 1}`, additionalImages[index]));
    }

    if (product.brand_name) {
        lines.push(xmlElement('ProductField16', product.brand_name));
    }

    if (product.category) {
        lines.push(xmlElement('ProductField24', product.category));
    }

    if (product.product_type) {
        lines.push(xmlElement('ProductField25', product.product_type));
    }



    if (product.is_special_order) {
        lines.push(xmlElement('ProductField11', 'yes'));
    }

    if (product.in_store_pickup) {
        lines.push(xmlElement('ProductField15', 'checked'));
    }

    // Canonical facet fields (corrected contract)
    if (product.pet_type) {
        lines.push(xmlElement('ProductField17', product.pet_type));
    }

    if (product.life_stage) {
        lines.push(xmlElement('ProductField18', product.life_stage));
    }

    if (product.pet_size) {
        lines.push(xmlElement('ProductField19', product.pet_size));
    }

    if (product.special_diet) {
        lines.push(xmlElement('ProductField20', product.special_diet));
    }

    if (product.health_feature) {
        lines.push(xmlElement('ProductField21', product.health_feature));
    }

    if (product.food_form) {
        lines.push(xmlElement('ProductField22', product.food_form));
    }

    if (product.flavor) {
        lines.push(xmlElement('ProductField23', product.flavor));
    }

    if (product.product_feature) {
        lines.push(xmlElement('ProductField26', product.product_feature));
    }

    if (product.size) {
        lines.push(xmlElement('ProductField27', product.size));
    }

    if (product.color) {
        lines.push(xmlElement('ProductField29', product.color));
    }

    if (product.packaging_type) {
        lines.push(xmlElement('ProductField30', product.packaging_type));
    }

    if (product.cross_sell_skus && product.cross_sell_skus.length > 0) {
        lines.push(xmlElement('ProductField32', product.cross_sell_skus.join('|')));
    }

    if (product.gtin) {
        lines.push(xmlElement('Google_GTIN', product.gtin));
    }

    if (product.is_taxable !== undefined) {
        lines.push(xmlElement('Taxable', product.is_taxable ? 'yes' : 'no'));
    }

    if (product.availability) {
        lines.push(xmlElement('Availability', product.availability));
    }

    if (product.minimum_quantity != null) {
        lines.push(xmlElement('MinimumQuantity', String(product.minimum_quantity)));
    }

    if (product.search_keywords) {
        lines.push(xmlCdataElement('SearchKeywords', product.search_keywords));
    }

    if (product.shopsite_pages && product.shopsite_pages.length > 0) {
        lines.push('    <ProductOnPages>');
        for (const pageName of product.shopsite_pages) {
            lines.push(`      <Name>${escapeXml(pageName)}</Name>`);
        }
        lines.push('    </ProductOnPages>');
    }

    lines.push('  </Product>');
    return lines.join('\n');
}

export function generateShopSiteXml(
    products: ShopSiteExportProduct[],
    options: ShopSiteXmlOptions = {},
): string {
    const lines: string[] = [];
    const newProductTag = options.newProductTag ?? buildShopSiteNewProductTag(options.markerDate);

    lines.push('<?xml version="1.0" encoding="ISO-8859-1"?>');
    lines.push(`<!DOCTYPE ShopSiteProducts PUBLIC "-//shopsite.com//ShopSiteProduct DTD//EN" "${SHOPSITE_DOCTYPE}">`);
    lines.push(`<ShopSiteProducts version="${SHOPSITE_XML_VERSION}">`);
    lines.push('<Products>');

    for (const product of products) {
        lines.push(generateProductXml(product, newProductTag));
    }

    lines.push('</Products>');
    lines.push('</ShopSiteProducts>');

    return lines.join('\n');
}

export function* generateShopSiteXmlStream(
    products: Iterable<ShopSiteExportProduct>,
    options: ShopSiteXmlOptions = {},
): Generator<string> {
    const newProductTag = options.newProductTag ?? buildShopSiteNewProductTag(options.markerDate);

    yield '<?xml version="1.0" encoding="ISO-8859-1"?>\n';
    yield `<!DOCTYPE ShopSiteProducts PUBLIC "-//shopsite.com//ShopSiteProduct DTD//EN" "${SHOPSITE_DOCTYPE}">\n`;
    yield `<ShopSiteProducts version="${SHOPSITE_XML_VERSION}">\n`;
    yield '<Products>\n';

    for (const product of products) {
        yield `${generateProductXml(product, newProductTag)}\n`;
    }

    yield '</Products>\n';
    yield '</ShopSiteProducts>\n';
}
