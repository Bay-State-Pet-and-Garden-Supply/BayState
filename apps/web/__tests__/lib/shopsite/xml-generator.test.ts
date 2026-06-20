import {
    buildShopSiteNewProductTag,
    generateShopSiteXml,
    cleanUnicodeForShopSite,
} from '@/lib/shopsite/xml-generator';

describe('generateShopSiteXml', () => {
    it('emits the restored ShopSite payload used by the original export flow', () => {
        const xml = generateShopSiteXml(
            [
                {
                    sku: '011641750056',
                    name: 'Feathered Friend Favorite 20 lb.',
                    price: 24.99,
                    description: 'Short shelf copy',
                    short_name: 'Favorite 20 lb.',
                    brand_name: 'Feathered Friend',
                    category: 'Wild Bird Food',
                    product_type: 'Seeds & Seed Mixes',
                    images: [
                        'feathered-friend/feathered-friend-favorite-20-lb.jpg',
                        'feathered-friend/feathered-friend-favorite-20-lb-2.jpg',
                    ],
                    weight: '20 lb.',
                    is_special_order: true,
                    in_store_pickup: true,
                },
            ],
            { markerDate: new Date('2026-03-26T15:13:29.698Z') },
        );

        expect(xml).toContain('<!DOCTYPE ShopSiteProducts PUBLIC "-//shopsite.com//ShopSiteProduct DTD//EN" "http://www.shopsite.com/XML/2.9/shopsiteproducts.dtd">');
        expect(xml).toContain('<ShopSiteProducts version="15.0">');
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<Products>');
        expect(xml).toContain('<Name>Feathered Friend Favorite 20 lb.</Name>');
        expect(xml).toContain('<SKU>011641750056</SKU>');
        expect(xml).toContain('<Price>24.99</Price>');
        expect(xml).toContain('<ProductField1>new032626</ProductField1>');
        expect(xml).toContain('<ProductDisabled>uncheck</ProductDisabled>');
        expect(xml).toContain('<MinimumQuantity>0</MinimumQuantity>');
        expect(xml).toContain('<Taxable>checked</Taxable>');
        expect(xml).toContain('<![CDATA[Feathered Friend Favorite 20 lb.]]>');
        expect(xml).toContain('<Weight>20 lb.</Weight>');
        expect(xml).toContain('<Graphic>feathered-friend/feathered-friend-favorite-20-lb.jpg</Graphic>');
        expect(xml).toContain('<MoreInformationGraphic>feathered-friend/feathered-friend-favorite-20-lb.jpg</MoreInformationGraphic>');
        expect(xml).toContain('<MoreInfoImage1>feathered-friend/feathered-friend-favorite-20-lb-2.jpg</MoreInfoImage1>');
        expect(xml).toContain('<ProductOnPages></ProductOnPages>');
        expect(xml).toContain('<ProductField16>Feathered Friend</ProductField16>');
        expect(xml).not.toContain('<ProductField24>');
        expect(xml).toContain('<ProductField25>Seeds &amp; Seed Mixes</ProductField25>');
        expect(xml).toContain('<ProductField11>yes</ProductField11>');
        expect(xml).toContain('<ProductField15>checked</ProductField15>');
        expect(xml).not.toContain('<Availability>');
    });

    it('omits optional fields that are not needed for upload', () => {
        const xml = generateShopSiteXml(
            [
                {
                    sku: 'SKU-EMPTY',
                    name: 'Placeholder Product',
                    price: 9.99,
                    images: [],
                },
            ],
            { newProductTag: 'new032626' },
        );

        expect(xml).toContain('<ProductField1>new032626</ProductField1>');
        expect(xml).toContain('<Products>');
        expect(xml).toContain('<Graphic>none</Graphic>');
        expect(xml).toContain('<MoreInformationGraphic>none</MoreInformationGraphic>');
        expect(xml).toContain('<ProductOnPages></ProductOnPages>');
        expect(xml).not.toContain('<ProductField16>');
        expect(xml).not.toContain('<ProductField24>');
        expect(xml).not.toContain('<ProductField25>');
        expect(xml).not.toContain('<ProductField11>');
        expect(xml).toContain('</Products>');
    });

    it('cleans Unicode characters that cause encoding issues on ShopSite', () => {
        const xml = generateShopSiteXml(
            [
                {
                    sku: 'SKU-UNICODE',
                    name: 'Instinct Human\u2011Grade Bone Broth', // non-breaking hyphen
                    price: 19.99,
                    images: [],
                    search_keywords: 'hydration\u00a0boost', // non-breaking space
                },
            ],
            { newProductTag: 'new032626' },
        );

        expect(xml).toContain('<Name>Instinct Human-Grade Bone Broth</Name>');
        expect(xml).toContain('<![CDATA[Instinct Human-Grade Bone Broth]]>');
        expect(xml).toContain('<![CDATA[hydration boost]]>');
    });
});

describe('cleanUnicodeForShopSite', () => {
    it('replaces common problematic Unicode characters with standard equivalents', () => {
        const input = 'Instinct Bone Broths add a nourishing, flavorful hydration boost to everyday pet food routines. This wholesome dog safe bone broth is made with 100% human\u2011grade ingredients to support digestion, hydration, and overall wellness with every pour. Each dog safe broth delivers moisture and functional benefits while enhancing the taste of meals your dog already\u2026';
        const expected = 'Instinct Bone Broths add a nourishing, flavorful hydration boost to everyday pet food routines. This wholesome dog safe bone broth is made with 100% human-grade ingredients to support digestion, hydration, and overall wellness with every pour. Each dog safe broth delivers moisture and functional benefits while enhancing the taste of meals your dog already...';
        expect(cleanUnicodeForShopSite(input)).toBe(expected);

        expect(cleanUnicodeForShopSite('“curly”')).toBe('"curly"');
        expect(cleanUnicodeForShopSite('‘single’')).toBe("'single'");
        expect(cleanUnicodeForShopSite('en\u2013dash em\u2014dash')).toBe('en-dash em--dash');
        expect(cleanUnicodeForShopSite('bullet\u2022point')).toBe('bullet*point');
        expect(cleanUnicodeForShopSite('Brand\u2122 (R)\u00ae (C)\u00a9')).toBe('BrandTM (R)(R) (C)(C)');
        expect(cleanUnicodeForShopSite('zero\u200bwidth\ufeffspace')).toBe('zerowidthspace');
    });
});

describe('buildShopSiteNewProductTag', () => {
    it('formats the tag using Bay State business dates', () => {
        expect(buildShopSiteNewProductTag(new Date('2026-03-26T15:13:29.698Z'))).toBe('new032626');
    });
});
