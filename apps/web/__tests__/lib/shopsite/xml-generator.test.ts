import {
    buildShopSiteNewProductTag,
    generateShopSiteXml,
} from '@/lib/shopsite/xml-generator';

describe('generateShopSiteXml', () => {
    it('emits the minimal ShopSite payload with the new-product tag', () => {
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

        expect(xml).toContain('<ShopSiteProducts version="15.0">');
        expect(xml).toContain('<Name>Feathered Friend Favorite 20 lb.</Name>');
        expect(xml).toContain('<Price>24.99</Price>');
        expect(xml).toContain('<SaleAmount/>');
        expect(xml).toContain('<ProductDisabled>uncheck</ProductDisabled>');
        expect(xml).toContain('<SKU>011641750056</SKU>');
        expect(xml).toContain('<ProductField1>new032626</ProductField1>');
        expect(xml).toContain('<![CDATA[Short shelf copy]]>');
        expect(xml).toContain('<Weight>20 lb.</Weight>');
        expect(xml).toContain('<ProductField7>Favorite 20 lb.</ProductField7>');
        expect(xml).toContain('<Graphic>feathered-friend/feathered-friend-favorite-20-lb.jpg</Graphic>');
        expect(xml).toContain('<MoreInformationGraphic>feathered-friend/feathered-friend-favorite-20-lb.jpg</MoreInformationGraphic>');
        expect(xml).toContain('<MoreInfoImage1>feathered-friend/feathered-friend-favorite-20-lb-2.jpg</MoreInfoImage1>');
        expect(xml).toContain('<ProductField16>Feathered Friend</ProductField16>');
        expect(xml).toContain('<ProductField24>Wild Bird Food</ProductField24>');
        expect(xml).toContain('<ProductField25>Seeds &amp; Seed Mixes</ProductField25>');
        expect(xml).toContain('<ProductField11>yes</ProductField11>');
        expect(xml).toContain('<ProductField15>checked</ProductField15>');
        expect(xml).not.toContain('<MinimumQuantity>');
        expect(xml).not.toContain('<Availability>');
        expect(xml).not.toContain('<FileName>');
        expect(xml).not.toContain('<ProductType>Tangible</ProductType>');
        expect(xml).not.toContain('<ProductOnPages>');
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
        expect(xml).not.toContain('<Graphic>');
        expect(xml).not.toContain('<MoreInformationGraphic>');
        expect(xml).not.toContain('<MoreInfoImage1>');
        expect(xml).not.toContain('<ProductField7>');
        expect(xml).not.toContain('<ProductField16>');
        expect(xml).not.toContain('<ProductField24>');
        expect(xml).not.toContain('<ProductField25>');
        expect(xml).not.toContain('<ProductField11>');
        expect(xml).not.toContain('<ProductField15>');
    });
});

describe('buildShopSiteNewProductTag', () => {
    it('formats the tag using Bay State business dates', () => {
        expect(buildShopSiteNewProductTag(new Date('2026-03-26T15:13:29.698Z'))).toBe('new032626');
    });
});
