const fs = require('fs');
const path = require('path');
const { generateShopSiteXml } = require('./apps/web/lib/shopsite/xml-generator.ts');
const xml = generateShopSiteXml([{
  sku: '011641750056',
  name: 'Feathered Friend Favorite 20 lb.',
  price: 24.99,
  description: 'Short shelf copy',
  brand_name: 'Feathered Friend',
  category: 'Wild Bird Food',
  product_type: 'Seeds & Seed Mixes',
  images: ['feathered-friend/10202061.jpg'],
  weight: '20',
  is_taxable: true,
  in_store_pickup: true,
  shopsite_pages: ['Wild Bird Seed & Seed Mixes', 'Wild Bird Food Shop All'],
  file_name: 'feathered-friend-favorite-20-lb.html',
  availability: 'in stock',
  minimum_quantity: 0,
  pet_type: 'Wild Bird',
  food_form: 'Seed Blend',
  cross_sell_skus: ['859860002019','645194779280','078978034525','093432262320']
}], { newProductTag: 'instock031226' });
const productBlock = xml.match(/<Product>[\s\S]*?<\/Product>/)?.[0] ?? '';
const tags = [...productBlock.matchAll(/<([A-Za-z0-9]+)(?:\s|>|\/)/g)].map(m => m[1]);
console.log(tags.join('\n'));
