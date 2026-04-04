/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ShopSiteClient } from '@/lib/admin/migration/shopsite-client';

type FieldMatrixRow = {
    field: string;
    meaning: string;
    target: string;
    backtickTarget?: boolean;
};

type RawFixtureProduct = {
    sku: string;
    name: string;
    fields: Record<string, string>;
};

type NormalizedContractProduct = {
    shortName: string | null;
    isSpecialOrder: boolean;
    inStorePickup: boolean;
    brandName: string | null;
    petTypeName: string | null;
    petTypeSource: 'direct' | 'inference' | 'none';
    lifeStage: string | null;
    petSize: string | null;
    specialDiet: string | null;
    healthFeature: string | null;
    foodForm: string | null;
    flavor: string | null;
    categoryName: string | null;
    productTypeName: string | null;
    productFeature: string | null;
    size: string | null;
    color: string | null;
    packagingType: string | null;
    crossSellSkus: string[];
    auditOnlyCategory: string | null;
};

const FIXTURE_PATH = path.resolve(__dirname, '../../../fixtures/corrected-field-contract.xml');
const MATRIX_PATH = path.resolve(__dirname, '../../../../docs/field-mapping-matrix.md');
const client = new ShopSiteClient({
    storeUrl: 'https://example.com',
    merchantId: 'test',
    password: 'test',
});

const EXPECTED_FIELD_MATRIX: FieldMatrixRow[] = [
    { field: 'PF7', meaning: 'Child / Short Name', target: 'products.short_name', backtickTarget: true },
    { field: 'PF11', meaning: 'Special Order', target: 'products.is_special_order', backtickTarget: true },
    { field: 'PF15', meaning: 'In Store Pick-up', target: 'products.in_store_pickup', backtickTarget: true },
    { field: 'PF16', meaning: 'Facet - Brand', target: 'Canonical brand input' },
    { field: 'PF17', meaning: 'Facet - Pet Type', target: 'Canonical pet type input' },
    { field: 'PF18', meaning: 'Facet - Lifestage', target: 'Generic normalized facet' },
    { field: 'PF19', meaning: 'Facet - Pet Size', target: 'Generic normalized facet' },
    { field: 'PF20', meaning: 'Facet - Special Diet', target: 'Generic normalized facet' },
    { field: 'PF21', meaning: 'Facet - Health Feature', target: 'Generic normalized facet' },
    { field: 'PF22', meaning: 'Facet - Food Form', target: 'Generic normalized facet' },
    { field: 'PF23', meaning: 'Facet - Flavor', target: 'Generic normalized facet' },
    { field: 'PF24', meaning: 'Facet - Category', target: 'Canonical category input' },
    { field: 'PF25', meaning: 'Facet - Product Type', target: 'Canonical product-type input' },
    { field: 'PF26', meaning: 'Facet - Product Feature', target: 'Generic normalized facet' },
    { field: 'PF27', meaning: 'Facet - Size', target: 'Generic normalized facet' },
    { field: 'PF29', meaning: 'Facet - Color', target: 'Generic normalized facet' },
    { field: 'PF30', meaning: 'Facet - Packaging Type', target: 'Generic normalized facet' },
    { field: 'PF32', meaning: 'Product Cross Sell', target: 'One-way cross-sell relation input' },
];

const FIXTURE_XML = readFileSync(FIXTURE_PATH, 'utf8');
const MATRIX_DOC = readFileSync(MATRIX_PATH, 'utf8');
const RAW_PRODUCTS = extractFixtureProducts(FIXTURE_XML);
const RAW_PRODUCT_MAP = new Map(RAW_PRODUCTS.map((product) => [product.sku, product]));
const KNOWN_SKUS = new Set(RAW_PRODUCTS.map((product) => product.sku));

function extractTagValue(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
    return (match?.[1] ?? '').trim();
}

function extractFixtureProducts(xml: string): RawFixtureProduct[] {
    const matches = xml.match(/<Product>([\s\S]*?)<\/Product>/g) ?? [];

    return matches.map((productXml) => {
        const fields: Record<string, string> = {};
        const fieldMatches = productXml.match(/<ProductField\d+>[\s\S]*?<\/ProductField\d+>/g) ?? [];

        for (const fieldXml of fieldMatches) {
            const tagMatch = fieldXml.match(/<(ProductField\d+)>/);
            if (!tagMatch) {
                continue;
            }

            fields[tagMatch[1]] = extractTagValue(fieldXml, tagMatch[1]);
        }

        return {
            sku: extractTagValue(productXml, 'SKU'),
            name: extractTagValue(productXml, 'Name'),
            fields,
        };
    });
}

function normalizeBlank(value: string | undefined): string | null {
    const trimmed = value?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
}

function parseContractBoolean(value: string | undefined): boolean {
    const normalized = value?.trim().toLowerCase() ?? '';
    return ['yes', 'checked', 'true', '1'].includes(normalized);
}

function inferPetType(product: RawFixtureProduct): string | null {
    const searchSpace = [product.name, product.fields.ProductField24, product.fields.ProductField25]
        .map((value) => value?.toLowerCase() ?? '')
        .join(' ');

    if (searchSpace.includes('cat')) {
        return 'Cat';
    }

    if (searchSpace.includes('dog')) {
        return 'Dog';
    }

    return null;
}

function normalizeCrossSells(product: RawFixtureProduct, knownSkus: Set<string>): string[] {
    const raw = normalizeBlank(product.fields.ProductField32);
    if (!raw) {
        return [];
    }

    const seen = new Set<string>();
    const links: string[] = [];

    for (const candidate of raw.split('|').map((value) => value.trim()).filter(Boolean)) {
        if (candidate === product.sku || seen.has(candidate) || !knownSkus.has(candidate)) {
            continue;
        }

        seen.add(candidate);
        links.push(candidate);
    }

    return links;
}

function normalizeContractProduct(product: RawFixtureProduct): NormalizedContractProduct {
    const directPetType = normalizeBlank(product.fields.ProductField17);
    const inferredPetType = directPetType ? null : inferPetType(product);

    return {
        shortName: normalizeBlank(product.fields.ProductField7),
        isSpecialOrder: parseContractBoolean(product.fields.ProductField11),
        inStorePickup: parseContractBoolean(product.fields.ProductField15),
        brandName: normalizeBlank(product.fields.ProductField16),
        petTypeName: directPetType ?? inferredPetType,
        petTypeSource: directPetType ? 'direct' : inferredPetType ? 'inference' : 'none',
        lifeStage: normalizeBlank(product.fields.ProductField18),
        petSize: normalizeBlank(product.fields.ProductField19),
        specialDiet: normalizeBlank(product.fields.ProductField20),
        healthFeature: normalizeBlank(product.fields.ProductField21),
        foodForm: normalizeBlank(product.fields.ProductField22),
        flavor: normalizeBlank(product.fields.ProductField23),
        categoryName: normalizeBlank(product.fields.ProductField24),
        productTypeName: normalizeBlank(product.fields.ProductField25),
        productFeature: normalizeBlank(product.fields.ProductField26),
        size: normalizeBlank(product.fields.ProductField27),
        color: normalizeBlank(product.fields.ProductField29),
        packagingType: normalizeBlank(product.fields.ProductField30),
        crossSellSkus: normalizeCrossSells(product, KNOWN_SKUS),
        auditOnlyCategory: normalizeBlank(product.fields.ProductField31),
    };
}

function getFixtureProduct(sku: string): RawFixtureProduct {
    const product = RAW_PRODUCT_MAP.get(sku);

    if (!product) {
        throw new Error(`Missing fixture product: ${sku}`);
    }

    return product;
}

describe('corrected ShopSite field mapping contract', () => {
    it('documents all 18 corrected ProductField mappings in the source-of-truth matrix', () => {
        expect(EXPECTED_FIELD_MATRIX).toHaveLength(18);

        for (const row of EXPECTED_FIELD_MATRIX) {
            const targetCell = row.backtickTarget ? `\`${row.target}\`` : row.target;
            expect(MATRIX_DOC).toContain(`| \`${row.field}\` | ${row.meaning} | ${targetCell} |`);
        }

        expect(MATRIX_DOC).toContain('`ProductField24` is the only canonical category source.');
        expect(MATRIX_DOC).toContain('`ProductField31` is audit-only raw payload and is never used for normalized category behavior.');
        expect(MATRIX_DOC).toContain('Blank canonical values clear normalized joins and nullable first-class fields on rerun.');
    });

    it('covers every required fixture scenario before parser or schema changes land', () => {
        expect(RAW_PRODUCT_MAP.has('PF24-WINS-001')).toBe(true);
        expect(RAW_PRODUCT_MAP.has('DIRECT-PET-001')).toBe(true);
        expect(RAW_PRODUCT_MAP.has('FALLBACK-PET-001')).toBe(true);
        expect(RAW_PRODUCT_MAP.has('XSELL-SOURCE-001')).toBe(true);
        expect(RAW_PRODUCT_MAP.has('XSELL-TARGET-001')).toBe(true);
    });

    it('treats PF24 as canonical and leaves PF31 audit-only', () => {
        const rawProduct = getFixtureProduct('PF24-WINS-001');
        const normalized = normalizeContractProduct(rawProduct);
        const parsedProducts = client.parseProductsXml(FIXTURE_XML);
        const parsedProduct = parsedProducts.find((product) => product.sku === 'PF24-WINS-001');

        expect(parsedProduct).toBeDefined();
        expect(normalized.categoryName).toBe('Dog Food');
        expect(normalized.auditOnlyCategory).toBe('Legacy Toy Bin');
        expect(parsedProduct?.categoryName).toBe('Dog Food');
        expect(parsedProduct?.rawXml).toContain('<ProductField31>Legacy Toy Bin</ProductField31>');
        expect(parsedProduct?.categoryName).not.toBe(normalized.auditOnlyCategory);
    });

    it('uses direct PF17 values canonically and treats PF7/PF11/PF15 as operational fields', () => {
        const normalized = normalizeContractProduct(getFixtureProduct('DIRECT-PET-001'));

        expect(normalized.shortName).toBe('Mini Trainers');
        expect(normalized.isSpecialOrder).toBe(true);
        expect(normalized.inStorePickup).toBe(true);
        expect(normalized.petTypeName).toBe('Dog');
        expect(normalized.petTypeSource).toBe('direct');
    });

    it('falls back to pet-type inference only when PF17 is blank', () => {
        const normalized = normalizeContractProduct(getFixtureProduct('FALLBACK-PET-001'));

        expect(normalized.petTypeName).toBe('Cat');
        expect(normalized.petTypeSource).toBe('inference');
    });

    it('clears nullable fields and normalized joins when canonical values are blank on rerun', () => {
        const normalized = normalizeContractProduct(getFixtureProduct('FALLBACK-PET-001'));

        expect(normalized).toMatchObject({
            shortName: null,
            brandName: null,
            lifeStage: null,
            petSize: null,
            specialDiet: null,
            healthFeature: null,
            foodForm: null,
            flavor: null,
            categoryName: null,
            productTypeName: null,
            productFeature: null,
            size: null,
            color: null,
            packagingType: null,
            crossSellSkus: [],
            isSpecialOrder: false,
            inStorePickup: false,
        });
    });

    it('applies PF32 one-way relation rules by skipping duplicates, self-links, and missing SKUs', () => {
        const normalized = normalizeContractProduct(getFixtureProduct('XSELL-SOURCE-001'));

        expect(normalized.crossSellSkus).toEqual(['XSELL-TARGET-001']);
    });
});
