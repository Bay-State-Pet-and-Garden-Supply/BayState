/**
 * ShopSite XML Generator
 *
 * Restores the original export-compatible payload shape used when the ShopSite
 * ZIP/XML workflow was first introduced, while preserving the current
 * new-product marker tag.
 */

import {
    SHOPSITE_XML_VERSION,
    MAX_MORE_INFO_IMAGES,
} from './constants';

const SHOPSITE_DOCTYPE_PUBLIC = '-//shopsite.com//ShopSiteProduct DTD//EN';
const SHOPSITE_DOCTYPE_URL = 'http://www.shopsite.com/XML/2.9/shopsiteproducts.dtd';
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
    if (value === null || value === undefined || value === '') {
        return `    <${tag} />`;
    }

    return `    <${tag}>${escapeXml(value)}</${tag}>`;
}

function xmlCdataElement(tag: string, value: string | null | undefined): string {
    if (value === null || value === undefined || value === '') {
        return `    <${tag} />`;
    }

    return `    <${tag}>${cdataWrap(value)}</${tag}>`;
}

function xmlLiteralElement(tag: string, value: string | null | undefined, emptyValue: string): string {
    if (value === null || value === undefined || value === '') {
        return `    <${tag}>${escapeXml(emptyValue)}</${tag}>`;
    }

    return `    <${tag}>${escapeXml(value)}</${tag}>`;
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
    const primaryImage = product.images[0] ?? null;
    const additionalImages = product.images.slice(1, 1 + MAX_MORE_INFO_IMAGES);
    const description = product.description ?? product.long_description ?? null;
    const productOnPages = product.shopsite_pages ?? [];

    lines.push('  <Product>');
    lines.push(xmlElement('Name', product.name));
    lines.push(xmlElement('Price', formatPrice(product.price)));
    lines.push('    <SaleAmount/>');
    lines.push(xmlElement('ProductDisabled', 'uncheck'));
    lines.push(xmlElement('Taxable', product.is_taxable !== false ? 'checked' : 'uncheck'));
    lines.push(xmlElement('MinimumQuantity', String(product.minimum_quantity ?? 0)));
    lines.push(xmlElement('SKU', product.sku));
    lines.push(xmlLiteralElement('Graphic', primaryImage, 'none'));
    lines.push(xmlLiteralElement('MoreInformationGraphic', primaryImage, 'none'));

    if (description) {
        lines.push(xmlCdataElement('ProductDescription', description));
    }

    if (product.weight != null && product.weight !== '') {
        lines.push(xmlElement('Weight', String(product.weight)));
    }

    if (product.search_keywords) {
        lines.push(xmlCdataElement('SearchKeywords', product.search_keywords));
    }

    if (product.availability) {
        lines.push(xmlElement('Availability', product.availability));
    }

    lines.push(xmlElement('ProductField1', newProductTag));

    if (product.is_special_order) {
        lines.push(xmlElement('ProductField11', 'yes'));
    }

    if (product.in_store_pickup) {
        lines.push(xmlElement('ProductField15', 'checked'));
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

    if (product.gtin) {
        lines.push(xmlElement('Google_GTIN', product.gtin));
    }

    if (productOnPages.length > 0) {
        lines.push('    <ProductOnPages>');
        for (const pageName of productOnPages) {
            lines.push(`      <Name>${escapeXml(pageName)}</Name>`);
        }
        lines.push('    </ProductOnPages>');
    } else {
        lines.push('    <ProductOnPages/>');
    }

    for (let index = 0; index < additionalImages.length; index += 1) {
        lines.push(xmlElement(`MoreInfoImage${index + 1}`, additionalImages[index]));
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
    lines.push(`<!DOCTYPE ShopSiteProducts PUBLIC "${SHOPSITE_DOCTYPE_PUBLIC}" "${SHOPSITE_DOCTYPE_URL}">`);
    lines.push(`<ShopSiteProducts version="${SHOPSITE_XML_VERSION}">`);
    lines.push('<Response>');
    lines.push('  <ResponseCode>1</ResponseCode>');
    lines.push('  <ResponseDescription>success</ResponseDescription>');
    lines.push('</Response>');
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
    yield `<!DOCTYPE ShopSiteProducts PUBLIC "${SHOPSITE_DOCTYPE_PUBLIC}" "${SHOPSITE_DOCTYPE_URL}">\n`;
    yield `<ShopSiteProducts version="${SHOPSITE_XML_VERSION}">\n`;
    yield '<Response>\n';
    yield '  <ResponseCode>1</ResponseCode>\n';
    yield '  <ResponseDescription>success</ResponseDescription>\n';
    yield '</Response>\n';
    yield '<Products>\n';

    for (const product of products) {
        yield `${generateProductXml(product, newProductTag)}\n`;
    }

    yield '</Products>\n';
    yield '</ShopSiteProducts>\n';
}
