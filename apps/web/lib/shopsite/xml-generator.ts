/**
 * ShopSite XML Generator
 *
 * Generates valid ShopSite DTD v1.9 XML for product export.
 * Handles image mapping, custom fields, and ProductOnPages structure.
 */

import {
    SHOPSITE_XML_VERSION,
    MAX_MORE_INFO_IMAGES,
} from './constants';

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

// ─── Product XML Generation ──────────────────────────────────────────────────

function generateProductXml(product: ShopSiteExportProduct): string {
    const lines: string[] = [];
    lines.push('  <Product>');

    // Core fields
    lines.push(xmlElement('Name', product.name));
    lines.push(xmlElement('SKU', product.sku));
    lines.push(xmlElement('Price', String(product.price)));

    // Weight
    if (product.weight != null && product.weight !== '') {
        lines.push(xmlElement('Weight', String(product.weight)));
    }

    // Taxable
    lines.push(xmlElement('Taxable', product.is_taxable !== false ? 'yes' : 'no'));

    // Product description (short - shown on category pages)
    if (product.description) {
        lines.push(xmlCdataElement('ProductDescription', product.description));
    }

    // Search keywords
    if (product.search_keywords) {
        lines.push(xmlElement('SearchKeywords', product.search_keywords));
    }

    // Images: Graphic + MoreInformationGraphic = first image
    if (product.images.length > 0) {
        const primaryImage = product.images[0];
        lines.push(xmlElement('Graphic', primaryImage));

        // Show "More Information" page when we have content
        lines.push(xmlElement('DisplayMoreInformationPage_', 'yes'));

        // More Information page content
        if (product.long_description) {
            lines.push(xmlCdataElement('MoreInformationText', product.long_description));
        }

        lines.push(xmlElement('MoreInformationGraphic', primaryImage));

        // Additional images: MoreInfoImage1 through MoreInfoImage7
        const additionalImages = product.images.slice(1, 1 + MAX_MORE_INFO_IMAGES);
        for (let i = 0; i < additionalImages.length; i++) {
            lines.push(xmlElement(`MoreInfoImage${i + 1}`, additionalImages[i]));
        }
    } else if (product.long_description) {
        lines.push(xmlElement('DisplayMoreInformationPage_', 'yes'));
        lines.push(xmlCdataElement('MoreInformationText', product.long_description));
    }

    // ProductOnPages
    if (product.shopsite_pages && product.shopsite_pages.length > 0) {
        lines.push('    <ProductOnPages>');
        for (const page of product.shopsite_pages) {
            lines.push(`      <Name>${escapeXml(page)}</Name>`);
        }
        lines.push('    </ProductOnPages>');
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
    lines.push(`<ShopSiteProducts version="${SHOPSITE_XML_VERSION}">`);
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
    yield `<ShopSiteProducts version="${SHOPSITE_XML_VERSION}">\n`;
    yield '<Products>\n';

    for (const product of products) {
        yield generateProductXml(product) + '\n';
    }

    yield '</Products>\n';
    yield '</ShopSiteProducts>\n';
}
