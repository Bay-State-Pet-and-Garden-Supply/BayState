const { getMappedCategorySlug } = require('../lib/facets/category-mapping');
const fs = require('fs');

const xml = fs.readFileSync('../../temp/web_inventory032126.xml', 'utf-8');

function extractXmlValue(xml, tag) {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
    const match = xml.match(regex);
    let value = match ? match[1].trim() : '';
    if (value.startsWith('<![CDATA[')) {
        value = value.substring(9, value.length - 3);
    }
    return value.replace(/&amp;/g, '&');
}

const productMatches = xml.match(/<(?:product|Product)>([\s\S]*?)<\/(?:product|Product)>/gi);
if (!productMatches) {
    console.log("No products found");
    process.exit(0);
}

console.log(`Found ${productMatches.length} products`);

let mappedCount = 0;
let unmapped = new Set();

for (let i = 0; i < 1000; i++) {
    const productXml = productMatches[i];
    const categoryName = extractXmlValue(productXml, 'ProductField24');
    const productTypeName = extractXmlValue(productXml, 'ProductField25');
    
    if (categoryName) {
        const slug = getMappedCategorySlug(categoryName, productTypeName);
        if (slug) {
            mappedCount++;
        } else {
            unmapped.add(`${categoryName} > ${productTypeName}`);
        }
    }
}

console.log(`Mapped ${mappedCount} out of 1000 products`);
console.log("Unmapped categories found:", Array.from(unmapped));
