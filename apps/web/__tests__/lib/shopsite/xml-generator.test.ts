import { generateShopSiteXml } from '@/lib/shopsite/xml-generator';

describe('generateShopSiteXml', () => {
    it('emits ShopSite wrapper fields and full image slot mapping', () => {
        const xml = generateShopSiteXml([
            {
                sku: '011641750056',
                name: 'Feathered Friend Favorite 20 lb.',
                price: 24.99,
                description: 'Short shelf copy',
                long_description: '<p>Long form details</p>',
                brand_name: 'Feathered Friend',
                category: 'Wild Bird Food',
                product_type: 'Seeds & Seed Mixes',
                shopsite_pages: ['Wild Bird Seed & Seed Mixes', 'Wild Bird Food Shop All'],
                search_keywords: 'bird, seed',
                images: [
                    'feathered-friend/feathered-friend-favorite-20-lb.jpg',
                    'feathered-friend/feathered-friend-favorite-20-lb-2.jpg',
                ],
                file_name: 'feathered-friend-favorite-20-lb.html',
                gtin: '011641750056',
                availability: 'in stock',
                minimum_quantity: 0,
                is_taxable: true,
            },
        ]);

        expect(xml).toContain('<ShopSiteProducts version="15.0">');
        expect(xml).toContain('<ResponseCode>1</ResponseCode>');
        expect(xml).toContain('<ProductDisabled>uncheck</ProductDisabled>');
        expect(xml).toContain('<MinimumQuantity>0</MinimumQuantity>');
        expect(xml).toContain('<Taxable>checked</Taxable>');
        expect(xml).toContain('<ProductType>Tangible</ProductType>');
        expect(xml).toContain('<GTIN>011641750056</GTIN>');
        expect(xml).toContain('<Availability>in stock</Availability>');
        expect(xml).toContain('<ProductOnPages>');
        expect(xml).toContain('<Name>Wild Bird Seed &amp; Seed Mixes</Name>');
        expect(xml).toContain('<DisplayMoreInformationPage>checked</DisplayMoreInformationPage>');
        expect(xml).toContain('<MoreInformationGraphic>feathered-friend/feathered-friend-favorite-20-lb.jpg</MoreInformationGraphic>');
        expect(xml).toContain('<FileName>feathered-friend-favorite-20-lb.html</FileName>');
        expect(xml).toContain('<MoreInfoImage1>feathered-friend/feathered-friend-favorite-20-lb-2.jpg</MoreInfoImage1>');
        expect(xml).toContain('<MoreInfoImage20>none</MoreInfoImage20>');
        expect(xml).toContain('<ProductField16>Feathered Friend</ProductField16>');
        expect(xml).toContain('<ProductField24>Wild Bird Food</ProductField24>');
        expect(xml).toContain('<ProductField25>Seeds &amp; Seed Mixes</ProductField25>');
        expect(xml).toContain('<![CDATA[<p>Long form details</p>]]>');
    });

    it('fills empty media and page structures with ShopSite-friendly placeholders', () => {
        const xml = generateShopSiteXml([
            {
                sku: 'SKU-EMPTY',
                name: 'Placeholder Product',
                price: 9.99,
                images: [],
                is_taxable: false,
            },
        ]);

        expect(xml).toContain('<ProductOnPages/>');
        expect(xml).toContain('<Taxable>uncheck</Taxable>');
        expect(xml).toContain('<Graphic />');
        expect(xml).toContain('<MoreInformationGraphic>none</MoreInformationGraphic>');
        expect(xml).toContain('<MoreInfoImage1>none</MoreInfoImage1>');
        expect(xml).toContain('<MoreInfoImage20>none</MoreInfoImage20>');
    });
});
