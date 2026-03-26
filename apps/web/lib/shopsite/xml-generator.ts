/**
 * ShopSite XML Generator
 *
 * Generates ShopSite XML aligned to the current Bay State sample export
 * (DTD 2.9 / version 15.0).
 * Handles image mapping, custom fields, and ProductOnPages structure.
 */

import {
    SHOPSITE_XML_VERSION,
    MAX_MORE_INFO_IMAGES,
} from './constants';

const SHOPSITE_DOCTYPE = 'http://www.shopsite.com/XML/2.9/shopsiteproducts.dtd';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShopSiteExportProduct {
    sku: string;
    name: string;
    price: number | string;
    weight?: string | number | null;
    brand_name?: string | null;
    description?: string | null;
    long_description?: string | null;
    images: string[];
    category?: string | null;
    product_type?: string | null;
    shopsite_pages?: string[] | null;
    search_keywords?: string | null;
    is_special_order?: boolean;
    is_taxable?: boolean;
    file_name?: string | null;
    gtin?: string | null;
    availability?: string | null;
    minimum_quantity?: number | null;
}

// ─── XML Helpers ─────────────────────────────────────────────────────────────

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

// ─── Product XML Generation ──────────────────────────────────────────────────

function generateProductXml(product: ShopSiteExportProduct): string {
    const lines: string[] = [];
    lines.push('  <Product>');

    // Core fields
    lines.push(xmlElement('Name', product.name));
    lines.push(xmlElement('SKU', product.sku));
    lines.push(xmlElement('Price', formatPrice(product.price)));
    lines.push(xmlElement('ProductDisabled', 'uncheck'));
    lines.push(xmlElement('MinimumQuantity', String(product.minimum_quantity ?? 0)));

    // Weight
    if (product.weight != null && product.weight !== '') {
        lines.push(xmlElement('Weight', String(product.weight)));
    }

    // Taxable
    lines.push(xmlElement('Taxable', product.is_taxable !== false ? 'checked' : 'uncheck'));

    lines.push(xmlElement('ProductType', 'Tangible'));

    if (product.gtin) {
        lines.push(xmlElement('GTIN', product.gtin));
    }

    if (product.availability) {
        lines.push(xmlElement('Availability', product.availability));
    }

    // Product description (short - shown on category pages)
    if (product.description) {
        lines.push(xmlCdataElement('ProductDescription', product.description));
    }

    // Search keywords
    if (product.search_keywords) {
        lines.push(xmlElement('SearchKeywords', product.search_keywords));
    }

    // Images: Graphic + MoreInformationGraphic = first image
    const primaryImage = product.images[0] ?? null;
    lines.push(xmlElement('Graphic', primaryImage));

    // ProductOnPages
    if (product.shopsite_pages && product.shopsite_pages.length > 0) {
        lines.push('    <ProductOnPages>');
        for (const page of product.shopsite_pages) {
            lines.push(`      <Name>${escapeXml(page)}</Name>`);
        }
        lines.push('    </ProductOnPages>');
    } else {
        lines.push('    <ProductOnPages/>');
    }

    lines.push(xmlElement('DisplayMoreInformationPage', 'checked'));

    if (product.long_description) {
        lines.push(xmlCdataElement('MoreInformationText', product.long_description));
    } else {
        lines.push('    <MoreInformationText/>');
    }

    lines.push(xmlLiteralElement('MoreInformationGraphic', primaryImage, 'none'));
    lines.push(xmlElement('FileName', product.file_name ?? `${product.sku}.html`));

    const additionalImages = product.images.slice(1, 1 + MAX_MORE_INFO_IMAGES);
    for (let i = 0; i < MAX_MORE_INFO_IMAGES; i++) {
        lines.push(xmlLiteralElement(`MoreInfoImage${i + 1}`, additionalImages[i], 'none'));
    }

    // Brand (both native field and legacy ProductField16)
    if (product.brand_name) {
        lines.push(xmlElement('Brand', product.brand_name));
        lines.push(xmlElement('ProductField16', product.brand_name));
    }

    // Special Order (ProductField11)
    if (product.is_special_order) {
        lines.push(xmlElement('ProductField11', 'yes'));
    }

    // Category (ProductField24 - pipe-delimited)
    if (product.category) {
        lines.push(xmlElement('ProductField24', product.category));
    }

    // Product Type (ProductField25 - pipe-delimited)
    if (product.product_type) {
        lines.push(xmlElement('ProductField25', product.product_type));
    }

    lines.push('  </Product>');
    return lines.join('\n');
}

// ─── Full Document Generation ────────────────────────────────────────────────

/**
 * Generate a complete ShopSite XML document from an array of products.
 */
export function generateShopSiteXml(products: ShopSiteExportProduct[]): string {
    const lines: string[] = [];

    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<!DOCTYPE ShopSiteProducts PUBLIC "-//shopsite.com//ShopSiteProduct DTD//EN" "${SHOPSITE_DOCTYPE}">`);
    lines.push(`<ShopSiteProducts version="${SHOPSITE_XML_VERSION}">`);
    lines.push('<Response>');
    lines.push('<ResponseCode>1</ResponseCode>');
    lines.push('<ResponseDescription>success</ResponseDescription>');
    lines.push('</Response>');
    lines.push('<Products>');

    for (const product of products) {
        lines.push(generateProductXml(product));
    }

    lines.push('</Products>');
    lines.push('</ShopSiteProducts>');

    return lines.join('\n');
}

/**
 * Stream-friendly XML generation.
 * Yields XML fragments for each product, bookended by header/footer.
 */
export function* generateShopSiteXmlStream(
    products: Iterable<ShopSiteExportProduct>,
): Generator<string> {
    yield '<?xml version="1.0" encoding="UTF-8"?>\n';
    yield `<!DOCTYPE ShopSiteProducts PUBLIC "-//shopsite.com//ShopSiteProduct DTD//EN" "${SHOPSITE_DOCTYPE}">\n`;
    yield `<ShopSiteProducts version="${SHOPSITE_XML_VERSION}">\n`;
    yield '<Response>\n';
    yield '<ResponseCode>1</ResponseCode>\n';
    yield '<ResponseDescription>success</ResponseDescription>\n';
    yield '</Response>\n';
    yield '<Products>\n';

    for (const product of products) {
        yield generateProductXml(product) + '\n';
    }

    yield '</Products>\n';
    yield '</ShopSiteProducts>\n';
}
